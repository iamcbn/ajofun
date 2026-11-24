import asyncio
from collections.abc import Callable
from contextlib import AbstractContextManager
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.auth import AuthenticatedUser, get_current_user
from app.db import DbConnection, get_db, get_db_session_factory
from app.identity_guard import check_identity_leak
from app.matcher import DrawError, generate_assignments
from app.qa_realtime import qa_broker, qa_message_limiter, qa_webhook_limiter
from app.schemas import (
    AnonymousMessageCreateRequest,
    AnonymousMessageResponse,
    DrawResponse,
    QaWebhookEventRequest,
    QaWebhookResponse,
    ResetDrawResponse,
)

router = APIRouter(prefix="/api/exchanges", tags=["exchanges"])

MAX_MESSAGES_PER_THREAD = 200


def _verify_exchange_member_or_organizer(
    cur,
    exchange_id: UUID,
    user_id: str,
) -> dict:
    cur.execute(
        """
        SELECT id, organizer_id, status, target_participants
        FROM public.exchanges
        WHERE id = %s
        """,
        (exchange_id,),
    )
    exchange = cur.fetchone()
    if exchange is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange not found.",
        )

    if exchange["organizer_id"] != user_id:
        cur.execute(
            """
            SELECT id
            FROM public.participants
            WHERE exchange_id = %s AND user_id = %s
            """,
            (exchange_id, user_id),
        )
        if cur.fetchone() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this exchange.",
            )
    return exchange


@router.post("/{exchange_id}/draw", response_model=DrawResponse)
def draw_exchange_names(
    exchange_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: DbConnection = Depends(get_db),
) -> DrawResponse:
    """Run a blind Anonymous Gifter draw for an open exchange.

    Never returns assignment pairs in the response so even the organizer stays blind.
    """
    with db.transaction():
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT id, organizer_id, status, target_participants
                FROM public.exchanges
                WHERE id = %s
                FOR UPDATE
                """,
                (exchange_id,),
            )
            exchange = cur.fetchone()
            if exchange is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Exchange not found.",
                )

            if exchange["organizer_id"] != user.user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the exchange organizer can draw names.",
                )

            if exchange["status"] != "open":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Names have already been drawn for this exchange.",
                )

            cur.execute(
                """
                SELECT id, user_id
                FROM public.participants
                WHERE exchange_id = %s
                ORDER BY joined_at ASC
                """,
                (exchange_id,),
            )
            participants = cur.fetchall()

            if exchange["target_participants"] is not None:
                target = int(exchange["target_participants"])
                if len(participants) < target:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Waiting for all participants before drawing "
                            f"({len(participants)} of {target} joined). "
                            "Update or remove the participant limit if your group size changed."
                        ),
                    )
                if len(participants) > target:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Participant count ({len(participants)}) exceeds the limit ({target}). "
                            "Update the participant limit before drawing."
                        ),
                    )

            cur.execute(
                """
                SELECT giver_participant_id, excluded_participant_id
                FROM public.exclusions
                WHERE exchange_id = %s
                """,
                (exchange_id,),
            )
            exclusions_rows = cur.fetchall()

            participant_to_user = {str(row["id"]): row["user_id"] for row in participants}
            user_ids = [row["user_id"] for row in participants]
            blocked_pairs = {
                (
                    participant_to_user[str(row["giver_participant_id"])],
                    participant_to_user[str(row["excluded_participant_id"])],
                )
                for row in exclusions_rows
                if str(row["giver_participant_id"]) in participant_to_user
                and str(row["excluded_participant_id"]) in participant_to_user
            }

            try:
                pairs = generate_assignments(user_ids, blocked_pairs)
            except DrawError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(exc),
                ) from exc

            cur.executemany(
                """
                INSERT INTO public.assignments (exchange_id, giver_id, recipient_id)
                VALUES (%s, %s, %s)
                """,
                [(exchange_id, giver_id, recipient_id) for giver_id, recipient_id in pairs.items()],
            )

            cur.execute(
                """
                UPDATE public.exchanges
                SET status = 'drawn', drawn_at = now()
                WHERE id = %s
                RETURNING drawn_at
                """,
                (exchange_id,),
            )
            updated = cur.fetchone()

    return DrawResponse(
        exchange_id=exchange_id,
        status="drawn",
        participant_count=len(user_ids),
        drawn_at=updated["drawn_at"],
    )


@router.post("/{exchange_id}/reset-draw", response_model=ResetDrawResponse)
def reset_exchange_draw(
    exchange_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: DbConnection = Depends(get_db),
) -> ResetDrawResponse:
    """Allow the organizer to reopen an exchange by clearing assignments and Q&A threads."""
    with db.transaction():
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT id, organizer_id, status, target_participants
                FROM public.exchanges
                WHERE id = %s
                FOR UPDATE
                """,
                (exchange_id,),
            )
            exchange = cur.fetchone()
            if exchange is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Exchange not found.",
                )

            if exchange["organizer_id"] != user.user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the exchange organizer can reset the draw.",
                )

            if exchange["status"] != "drawn":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only exchanges currently in 'drawn' status can be reset.",
                )

            cur.execute(
                "DELETE FROM public.anonymous_messages WHERE exchange_id = %s",
                (exchange_id,),
            )
            cur.execute(
                "DELETE FROM public.assignments WHERE exchange_id = %s",
                (exchange_id,),
            )
            cur.execute(
                """
                UPDATE public.exchanges
                SET status = 'open', drawn_at = NULL
                WHERE id = %s
                """,
                (exchange_id,),
            )

    qa_broker.publish_to_exchange(
        str(exchange_id),
        "exchange_reset",
        {"exchange_id": str(exchange_id)},
    )
    return ResetDrawResponse(exchange_id=exchange_id, status="open")


@router.post(
    "/{exchange_id}/qa/messages",
    response_model=AnonymousMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_anonymous_qa_message(
    exchange_id: UUID,
    payload: AnonymousMessageCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: DbConnection = Depends(get_db),
) -> AnonymousMessageResponse:
    """Validate, persist, and fan out an anonymous Q&A message via live SSE."""
    allowed_rate, retry_after = qa_message_limiter.check_and_record(
        f"{exchange_id}:{user.user_id}"
    )
    if not allowed_rate:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many messages sent. Please wait a moment before sending another.",
            headers={"Retry-After": str(retry_after)},
        )

    with db.transaction():
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT id, organizer_id, status, target_participants
                FROM public.exchanges
                WHERE id = %s
                """,
                (exchange_id,),
            )
            exchange = cur.fetchone()
            if exchange is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Exchange not found.",
                )

            if exchange["status"] == "completed":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This exchange is completed and Anonymous Q&A is now read-only.",
                )
            if exchange["status"] != "drawn":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Anonymous Q&A is only available after names are drawn.",
                )

            cur.execute(
                """
                SELECT id, giver_id, recipient_id
                FROM public.assignments
                WHERE id = %s AND exchange_id = %s
                """,
                (payload.assignment_id, exchange_id),
            )
            assignment = cur.fetchone()
            if assignment is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assignment thread not found.",
                )

            allowed = (
                (payload.sender_role == "santa" and assignment["giver_id"] == user.user_id)
                or (
                    payload.sender_role == "recipient"
                    and assignment["recipient_id"] == user.user_id
                )
            )
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to post to this thread.",
                )

            cur.execute(
                """
                SELECT COUNT(*)::int AS message_count
                FROM public.anonymous_messages
                WHERE assignment_id = %s
                """,
                (payload.assignment_id,),
            )
            count_row = cur.fetchone()
            if count_row and int(count_row["message_count"]) >= MAX_MESSAGES_PER_THREAD:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="This anonymous Q&A thread has reached its message limit.",
                )

            cur.execute(
                """
                SELECT display_name, alias
                FROM public.participants
                WHERE exchange_id = %s AND user_id = %s
                """,
                (exchange_id, user.user_id),
            )
            participant = cur.fetchone()

            leak_check = check_identity_leak(
                payload.body,
                display_name=participant["display_name"] if participant else None,
                alias=participant["alias"] if participant else None,
                account_name=user.name,
                email=user.email,
            )
            if leak_check.blocked:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=leak_check.reason or "Identity reveal blocked in Anonymous Q&A.",
                )

            cur.execute(
                """
                INSERT INTO public.anonymous_messages (exchange_id, assignment_id, sender_role, body)
                VALUES (%s, %s, %s, %s)
                RETURNING id, exchange_id, assignment_id, sender_role, body, created_at
                """,
                (exchange_id, payload.assignment_id, payload.sender_role, payload.body),
            )
            inserted = cur.fetchone()

    created_at = inserted["created_at"]
    message_payload = {
        "id": str(inserted["id"]),
        "exchange_id": str(inserted["exchange_id"]),
        "assignment_id": str(inserted["assignment_id"]),
        "sender_role": inserted["sender_role"],
        "body": inserted["body"],
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
    }
    qa_broker.publish_to_users(
        str(exchange_id),
        (assignment["giver_id"], assignment["recipient_id"]),
        "qa_message",
        message_payload,
    )
    return AnonymousMessageResponse(**inserted)


@router.post("/{exchange_id}/qa-webhook", response_model=QaWebhookResponse)
def notify_qa_webhook(
    exchange_id: UUID,
    payload: QaWebhookEventRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: DbConnection = Depends(get_db),
) -> QaWebhookResponse:
    """Authenticated webhook receiver that notifies connected Q&A clients to sync."""
    allowed_rate, retry_after = qa_webhook_limiter.check_and_record(
        f"{exchange_id}:{user.user_id}"
    )
    if not allowed_rate:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sync notifications. Please wait a moment.",
            headers={"Retry-After": str(retry_after)},
        )

    with db.cursor() as cur:
        exchange = _verify_exchange_member_or_organizer(cur, exchange_id, user.user_id)

        if payload.assignment_id is not None:
            cur.execute(
                """
                SELECT id, giver_id, recipient_id
                FROM public.assignments
                WHERE id = %s AND exchange_id = %s
                """,
                (payload.assignment_id, exchange_id),
            )
            assignment = cur.fetchone()
            if assignment is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assignment thread not found.",
                )
            if user.user_id not in (assignment["giver_id"], assignment["recipient_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to trigger notifications for this thread.",
                )
            delivered = qa_broker.publish_to_users(
                str(exchange_id),
                (assignment["giver_id"], assignment["recipient_id"]),
                "sync_required",
                {
                    "exchange_id": str(exchange_id),
                    "assignment_id": str(payload.assignment_id),
                    "event": payload.event,
                },
            )
            return QaWebhookResponse(status="broadcast", delivered=delivered)

        if exchange["organizer_id"] != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the exchange organizer can trigger exchange-wide sync notifications.",
            )

    delivered = qa_broker.publish_to_exchange(
        str(exchange_id),
        "sync_required",
        {
            "exchange_id": str(exchange_id),
            "event": payload.event,
        },
    )
    return QaWebhookResponse(status="broadcast", delivered=delivered)


@router.get("/{exchange_id}/qa-stream")
async def stream_qa_events(
    exchange_id: UUID,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db_factory: Callable[[], AbstractContextManager[DbConnection]] = Depends(
        get_db_session_factory
    ),
) -> StreamingResponse:
    """Authenticated Server-Sent Events (SSE) stream so Anonymous Q&A updates live."""
    with db_factory() as db:
        with db.cursor() as cur:
            _verify_exchange_member_or_organizer(cur, exchange_id, user.user_id)

    key = str(exchange_id)
    try:
        queue = qa_broker.subscribe(key, user.user_id)
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Concurrent realtime connection limit exceeded.",
        )

    async def event_generator():
        try:
            yield f"event: connected\ndata: {json.dumps({'exchange_id': key})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {item['event']}\ndata: {json.dumps(item['data'])}\n\n"
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    try:
                        with db_factory() as db:
                            with db.cursor() as cur:
                                _verify_exchange_member_or_organizer(cur, exchange_id, user.user_id)
                    except HTTPException:
                        break
                    yield ": keep-alive\n\n"
        finally:
            qa_broker.unsubscribe(key, user.user_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
