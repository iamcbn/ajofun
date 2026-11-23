import json

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.db import DbConnection, get_db
from app.schemas import InvitePreviewResponse, JoinExchangeRequest, JoinExchangeResponse

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.get("/{code}", response_model=InvitePreviewResponse)
def get_invite_preview(code: str, db: DbConnection = Depends(get_db)) -> InvitePreviewResponse:
    """Return a non-PII public summary of an exchange from its invite code."""
    normalized = code.strip().upper()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
              e.id AS exchange_id,
              e.title,
              e.description,
              e.budget_amount,
              e.currency,
              e.exchange_date,
              e.status,
              e.target_participants,
              COUNT(p.id)::int AS participant_count
            FROM public.exchanges e
            LEFT JOIN public.participants p ON p.exchange_id = e.id
            WHERE upper(e.invite_code) = %s
            GROUP BY e.id
            """,
            (normalized,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found.")

    return InvitePreviewResponse(
        exchange_id=row["exchange_id"],
        title=row["title"],
        description=row["description"],
        budget_amount=float(row["budget_amount"]) if row["budget_amount"] is not None else None,
        currency=row["currency"],
        exchange_date=row["exchange_date"],
        status=row["status"],
        participant_count=int(row["participant_count"]),
        target_participants=row["target_participants"],
    )


@router.post("/{code}/join", response_model=JoinExchangeResponse)
def join_exchange_by_code(
    code: str,
    payload: JoinExchangeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: DbConnection = Depends(get_db),
) -> JoinExchangeResponse:
    """Join an open exchange using a valid invite code."""
    normalized = code.strip().upper()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found.")

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification is required to join an exchange.",
        )

    wishlist_json = json.dumps([item.model_dump(mode="json") for item in payload.wishlist_items])

    with db.transaction():
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, target_participants
                FROM public.exchanges
                WHERE upper(invite_code) = %s
                FOR UPDATE
                """,
                (normalized,),
            )
            exchange = cur.fetchone()

            if exchange is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Invite code not found.",
                )

            cur.execute(
                """
                SELECT id
                FROM public.participants
                WHERE exchange_id = %s AND user_id = %s
                """,
                (exchange["id"], user.user_id),
            )
            existing = cur.fetchone()
            if existing is not None:
                return JoinExchangeResponse(
                    exchange_id=exchange["id"],
                    participant_id=existing["id"],
                    already_joined=True,
                )

            if exchange["status"] != "open":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This exchange has already drawn names and is closed to new participants.",
                )

            if exchange["target_participants"] is not None:
                cur.execute(
                    """
                    SELECT COUNT(*)::int AS participant_count
                    FROM public.participants
                    WHERE exchange_id = %s
                    """,
                    (exchange["id"],),
                )
                count_row = cur.fetchone()
                current_count = int(count_row["participant_count"]) if count_row else 0
                limit = int(exchange["target_participants"])
                if current_count >= limit:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"This exchange is full ({limit}/{limit} participants joined).",
                    )

            account_name = (user.name or "").strip()
            effective_display_name = account_name if account_name else payload.display_name
            cleaned_alias = payload.alias.strip()
            if cleaned_alias.lower() == effective_display_name.lower():
                cleaned_alias = ""

            cur.execute(
                """
                INSERT INTO public.participants (
                  exchange_id,
                  user_id,
                  display_name,
                  alias,
                  wishlist_items,
                  dislikes,
                  delivery_notes
                )
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (exchange_id, user_id) DO NOTHING
                RETURNING id
                """,
                (
                    exchange["id"],
                    user.user_id,
                    effective_display_name,
                    cleaned_alias,
                    wishlist_json,
                    payload.dislikes,
                    payload.delivery_notes,
                ),
            )
            inserted = cur.fetchone()
            if inserted is None:
                cur.execute(
                    """
                    SELECT id
                    FROM public.participants
                    WHERE exchange_id = %s AND user_id = %s
                    """,
                    (exchange["id"], user.user_id),
                )
                fallback = cur.fetchone()
                if fallback is None:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Could not complete exchange membership.",
                    )
                return JoinExchangeResponse(
                    exchange_id=exchange["id"],
                    participant_id=fallback["id"],
                    already_joined=True,
                )

            return JoinExchangeResponse(
                exchange_id=exchange["id"],
                participant_id=inserted["id"],
                already_joined=False,
            )
