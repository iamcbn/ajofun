from collections.abc import Generator
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_db, get_db_session_factory
from app.main import create_app
from app.qa_realtime import qa_broker, qa_message_limiter, qa_webhook_limiter
from app.routes.exchanges import MAX_MESSAGES_PER_THREAD


class FakeCursor:
    def __init__(self, state: dict[str, dict]) -> None:
        self.state = state
        self._result: list[dict] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def execute(self, query: str, params: tuple = ()) -> None:
        normalized_sql = " ".join(query.split())
        self._result = []

        if "FROM public.exchanges e" in normalized_sql and "WHERE upper(e.invite_code) = %s" in normalized_sql:
            code = params[0]
            for ex in self.state["exchanges"].values():
                if ex["invite_code"].upper() == code:
                    count = sum(1 for p in self.state["participants"].values() if p["exchange_id"] == ex["id"])
                    self._result = [
                        {
                            "exchange_id": ex["id"],
                            "title": ex["title"],
                            "description": ex["description"],
                            "budget_amount": ex["budget_amount"],
                            "currency": ex["currency"],
                            "exchange_date": ex["exchange_date"],
                            "status": ex["status"],
                            "target_participants": ex.get("target_participants"),
                            "participant_count": count,
                        }
                    ]
                    break
            return

        if "SELECT id, status, target_participants FROM public.exchanges WHERE upper(invite_code) = %s" in normalized_sql:
            code = params[0]
            for ex in self.state["exchanges"].values():
                if ex["invite_code"].upper() == code:
                    self._result = [
                        {
                            "id": ex["id"],
                            "status": ex["status"],
                            "target_participants": ex.get("target_participants"),
                        }
                    ]
                    break
            return

        if "SELECT COUNT(*)::int AS participant_count FROM public.participants WHERE exchange_id = %s" in normalized_sql:
            ex_id = params[0]
            count = sum(1 for p in self.state["participants"].values() if p["exchange_id"] == ex_id)
            self._result = [{"participant_count": count}]
            return

        if "SELECT id FROM public.participants WHERE exchange_id = %s AND user_id = %s" in normalized_sql:
            ex_id, uid = params
            for p in self.state["participants"].values():
                if p["exchange_id"] == ex_id and p["user_id"] == uid:
                    self._result = [{"id": p["id"]}]
                    break
            return

        if normalized_sql.startswith("INSERT INTO public.participants"):
            ex_id, uid, display_name, alias, wishlist_json, dislikes, delivery_notes = params
            for p in self.state["participants"].values():
                if p["exchange_id"] == ex_id and p["user_id"] == uid:
                    self._result = []
                    return
            pid = uuid4()
            self.state["participants"][pid] = {
                "id": pid,
                "exchange_id": ex_id,
                "user_id": uid,
                "display_name": display_name,
                "alias": alias,
                "wishlist_items": wishlist_json,
                "dislikes": dislikes,
                "delivery_notes": delivery_notes,
                "joined_at": datetime.now(timezone.utc),
            }
            self._result = [{"id": pid}]
            return

        if "SELECT id, organizer_id, status, target_participants FROM public.exchanges WHERE id = %s" in normalized_sql:
            ex_id = params[0]
            ex = self.state["exchanges"].get(ex_id)
            if ex is not None:
                self._result = [
                    {
                        "id": ex["id"],
                        "organizer_id": ex["organizer_id"],
                        "status": ex["status"],
                        "target_participants": ex.get("target_participants"),
                    }
                ]
            return

        if "SELECT id, user_id FROM public.participants WHERE exchange_id = %s" in normalized_sql:
            ex_id = params[0]
            rows = [
                {"id": p["id"], "user_id": p["user_id"], "joined_at": p["joined_at"]}
                for p in self.state["participants"].values()
                if p["exchange_id"] == ex_id
            ]
            rows.sort(key=lambda r: r["joined_at"])
            self._result = [{"id": r["id"], "user_id": r["user_id"]} for r in rows]
            return

        if "SELECT giver_participant_id, excluded_participant_id FROM public.exclusions WHERE exchange_id = %s" in normalized_sql:
            ex_id = params[0]
            self._result = [
                {
                    "giver_participant_id": r["giver_participant_id"],
                    "excluded_participant_id": r["excluded_participant_id"],
                }
                for r in self.state["exclusions"]
                if r["exchange_id"] == ex_id
            ]
            return

        if "UPDATE public.exchanges SET status = 'drawn'" in normalized_sql:
            ex_id = params[0]
            now = datetime.now(timezone.utc)
            self.state["exchanges"][ex_id]["status"] = "drawn"
            self.state["exchanges"][ex_id]["drawn_at"] = now
            self._result = [{"drawn_at": now}]
            return

        if "DELETE FROM public.anonymous_messages WHERE exchange_id = %s" in normalized_sql:
            ex_id = params[0]
            self.state["anonymous_messages"] = [
                m for m in self.state["anonymous_messages"] if m["exchange_id"] != ex_id
            ]
            return

        if "DELETE FROM public.assignments WHERE exchange_id = %s" in normalized_sql:
            ex_id = params[0]
            self.state["assignments"] = [
                a for a in self.state["assignments"] if a["exchange_id"] != ex_id
            ]
            return

        if "UPDATE public.exchanges SET status = 'open', drawn_at = NULL WHERE id = %s" in normalized_sql:
            ex_id = params[0]
            self.state["exchanges"][ex_id]["status"] = "open"
            self.state["exchanges"][ex_id]["drawn_at"] = None
            return

        if "SELECT id, giver_id, recipient_id FROM public.assignments WHERE id = %s AND exchange_id = %s" in normalized_sql:
            asgn_id, ex_id = params
            for asgn in self.state["assignments"]:
                if asgn["id"] == asgn_id and asgn["exchange_id"] == ex_id:
                    self._result = [
                        {
                            "id": asgn["id"],
                            "giver_id": asgn["giver_id"],
                            "recipient_id": asgn["recipient_id"],
                        }
                    ]
                    break
            return

        if "SELECT display_name, alias FROM public.participants WHERE exchange_id = %s AND user_id = %s" in normalized_sql:
            ex_id, uid = params
            for p in self.state["participants"].values():
                if p["exchange_id"] == ex_id and p["user_id"] == uid:
                    self._result = [
                        {
                            "display_name": p["display_name"],
                            "alias": p.get("alias", ""),
                        }
                    ]
                    break
            return

        if "SELECT COUNT(*)::int AS message_count FROM public.anonymous_messages WHERE assignment_id = %s" in normalized_sql:
            asgn_id = params[0]
            count = sum(1 for m in self.state["anonymous_messages"] if m["assignment_id"] == asgn_id)
            self._result = [{"message_count": count}]
            return

        if normalized_sql.startswith("INSERT INTO public.anonymous_messages"):
            ex_id, asgn_id, sender_role, body = params
            row = {
                "id": uuid4(),
                "exchange_id": ex_id,
                "assignment_id": asgn_id,
                "sender_role": sender_role,
                "body": body,
                "created_at": datetime.now(timezone.utc),
            }
            self.state["anonymous_messages"].append(row)
            self._result = [row]
            return

        raise AssertionError(f"Unhandled fake SQL: {normalized_sql}")

    def executemany(self, query: str, params_seq: list[tuple]) -> None:
        normalized_sql = " ".join(query.split())
        if normalized_sql.startswith("INSERT INTO public.assignments"):
            for ex_id, giver_id, recipient_id in params_seq:
                self.state["assignments"].append(
                    {
                        "id": uuid4(),
                        "exchange_id": ex_id,
                        "giver_id": giver_id,
                        "recipient_id": recipient_id,
                    }
                )
            return
        raise AssertionError(f"Unhandled fake executemany SQL: {normalized_sql}")

    def fetchone(self) -> dict | None:
        return self._result[0] if self._result else None

    def fetchall(self) -> list[dict]:
        return list(self._result)


class FakeConnection:
    def __init__(self, state: dict[str, dict]) -> None:
        self.state = state

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.state)

    @contextmanager
    def transaction(self) -> Generator[None, None, None]:
        yield


@pytest.fixture()
def seeded_env() -> Generator[tuple[TestClient, dict, dict[str, AuthenticatedUser], UUID], None, None]:
    qa_message_limiter.reset()
    qa_webhook_limiter.reset()
    ex_id = UUID("11111111-1111-1111-1111-111111111111")
    organizer = AuthenticatedUser(user_id="user-org", email="org@example.com", name="Organizer")
    guest = AuthenticatedUser(user_id="user-guest", email="guest@example.com", name="Guest")
    active_user = {"current": organizer}

    state: dict = {
        "exchanges": {
            ex_id: {
                "id": ex_id,
                "title": "Design Team Gift Swap",
                "description": "Bring something thoughtful!",
                "budget_amount": Decimal("25.00"),
                "currency": "USD",
                "exchange_date": date(2026, 12, 20),
                "invite_code": "SNOW2026",
                "organizer_id": organizer.user_id,
                "status": "open",
                "target_participants": None,
                "drawn_at": None,
            }
        },
        "participants": {},
        "exclusions": [],
        "assignments": [],
        "anonymous_messages": [],
    }

    p1, p2 = uuid4(), uuid4()
    state["participants"][p1] = {
        "id": p1,
        "exchange_id": ex_id,
        "user_id": "user-org",
        "display_name": "Organizer",
        "alias": "",
        "wishlist_items": "[]",
        "dislikes": "",
        "delivery_notes": "",
        "joined_at": datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc),
    }
    state["participants"][p2] = {
        "id": p2,
        "exchange_id": ex_id,
        "user_id": "user-alice",
        "display_name": "Alice",
        "alias": "",
        "wishlist_items": "[]",
        "dislikes": "",
        "delivery_notes": "",
        "joined_at": datetime(2026, 11, 20, 10, 5, tzinfo=timezone.utc),
    }

    app = create_app()
    fake_conn = FakeConnection(state)

    @contextmanager
    def fake_session_factory() -> Generator[FakeConnection, None, None]:
        yield fake_conn

    app.dependency_overrides[get_db] = lambda: fake_conn
    app.dependency_overrides[get_db_session_factory] = lambda: fake_session_factory
    app.dependency_overrides[get_current_user] = lambda: active_user["current"]

    client = TestClient(app)
    users = {"organizer": organizer, "guest": guest, "active": active_user}
    try:
        yield client, state, users, ex_id
    finally:
        qa_message_limiter.reset()
        qa_webhook_limiter.reset()


def test_health(seeded_env) -> None:
    client, *_ = seeded_env
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_invite_preview_returns_non_pii_summary_and_404_unknown(seeded_env) -> None:
    client, _, _, ex_id = seeded_env
    res = client.get("/api/invites/snow2026")
    assert res.status_code == 200
    body = res.json()
    assert body["exchange_id"] == str(ex_id)
    assert body["title"] == "Design Team Gift Swap"
    assert body["budget_amount"] == 25.0
    assert body["participant_count"] == 2
    assert set(body.keys()) == {
        "exchange_id",
        "title",
        "description",
        "budget_amount",
        "currency",
        "exchange_date",
        "status",
        "participant_count",
        "target_participants",
    }

    missing = client.get("/api/invites/DOESNOTEXIST")
    assert missing.status_code == 404


def test_join_exchange_idempotent_and_rejects_bad_urls_or_closed(seeded_env) -> None:
    client, state, users, ex_id = seeded_env

    # Unverified email is rejected
    users["active"]["current"] = AuthenticatedUser(
        user_id="user-unverified",
        email="unverified@example.com",
        email_verified=False,
    )
    unverified_res = client.post(
        "/api/invites/SNOW2026/join",
        json={"display_name": "Unverified", "wishlist_items": []},
    )
    assert unverified_res.status_code == 403

    users["active"]["current"] = users["guest"]

    bad_url = client.post(
        "/api/invites/SNOW2026/join",
        json={
            "display_name": "Guest",
            "wishlist_items": [{"title": "XSS link", "url": "javascript:alert(1)"}],
        },
    )
    assert bad_url.status_code == 422

    first = client.post(
        "/api/invites/SNOW2026/join",
        json={
            "display_name": "Fake Name",
            "alias": "Guesty",
            "wishlist_items": [{"title": "Pour-over kettle", "url": "https://example.com/kettle"}],
            "dislikes": "Peanuts",
            "delivery_notes": "Front desk",
        },
    )
    assert first.status_code == 200
    assert first.json()["already_joined"] is False
    assert first.json()["exchange_id"] == str(ex_id)

    joined_pid = UUID(first.json()["participant_id"])
    assert state["participants"][joined_pid]["display_name"] == "Guest"
    assert state["participants"][joined_pid]["alias"] == "Guesty"

    second = client.post(
        "/api/invites/SNOW2026/join",
        json={"display_name": "Guest"},
    )
    assert second.status_code == 200
    assert second.json()["already_joined"] is True

    # Closed exchange blocks brand-new joiners
    state["exchanges"][ex_id]["status"] = "drawn"
    users["active"]["current"] = AuthenticatedUser(user_id="user-latecomer")
    closed = client.post("/api/invites/SNOW2026/join", json={"display_name": "Late"})
    assert closed.status_code == 409


def test_draw_permissions_validation_blind_response_and_reset(seeded_env) -> None:
    client, state, users, ex_id = seeded_env

    # Non-organizer cannot draw
    users["active"]["current"] = users["guest"]
    forbidden = client.post(f"/api/exchanges/{ex_id}/draw")
    assert forbidden.status_code == 403

    # Organizer cannot draw with < 3 participants
    users["active"]["current"] = users["organizer"]
    too_few = client.post(f"/api/exchanges/{ex_id}/draw")
    assert too_few.status_code == 422

    # Add 3rd participant
    users["active"]["current"] = users["guest"]
    joined = client.post("/api/invites/SNOW2026/join", json={"display_name": "Guest"})
    assert joined.status_code == 200

    # Organizer draws successfully, and response does NOT leak assignments
    users["active"]["current"] = users["organizer"]
    drawn = client.post(f"/api/exchanges/{ex_id}/draw")
    assert drawn.status_code == 200
    draw_body = drawn.json()
    assert draw_body["status"] == "drawn"
    assert draw_body["participant_count"] == 3
    assert set(draw_body.keys()) == {"exchange_id", "status", "participant_count", "drawn_at"}
    assert len(state["assignments"]) == 3

    # Re-drawing while already drawn returns 409
    already = client.post(f"/api/exchanges/{ex_id}/draw")
    assert already.status_code == 409

    # Non-organizer cannot reset
    users["active"]["current"] = users["guest"]
    assert client.post(f"/api/exchanges/{ex_id}/reset-draw").status_code == 403

    # Organizer resets draw
    users["active"]["current"] = users["organizer"]
    reset = client.post(f"/api/exchanges/{ex_id}/reset-draw")
    assert reset.status_code == 200
    assert reset.json() == {"exchange_id": str(ex_id), "status": "open"}
    assert state["exchanges"][ex_id]["status"] == "open"
    assert state["assignments"] == []

    # Resetting again when already 'open' (or 'completed') is rejected
    reset_again = client.post(f"/api/exchanges/{ex_id}/reset-draw")
    assert reset_again.status_code == 400


def test_target_participants_blocks_overflow_and_gates_draw(seeded_env) -> None:
    client, state, users, ex_id = seeded_env
    state["exchanges"][ex_id]["target_participants"] = 3

    preview = client.get("/api/invites/SNOW2026")
    assert preview.status_code == 200
    assert preview.json()["participant_count"] == 2
    assert preview.json()["target_participants"] == 3

    # Draw fails while 2 of 3 joined
    users["active"]["current"] = users["organizer"]
    waiting = client.post(f"/api/exchanges/{ex_id}/draw")
    assert waiting.status_code == 422

    # 3rd spot succeeds
    users["active"]["current"] = users["guest"]
    third = client.post("/api/invites/SNOW2026/join", json={"display_name": "Guest"})
    assert third.status_code == 200
    assert third.json()["already_joined"] is False

    # 4th new user is blocked once full
    users["active"]["current"] = AuthenticatedUser(user_id="user-fourth", email="fourth@example.com")
    overflow = client.post("/api/invites/SNOW2026/join", json={"display_name": "Fourth"})
    assert overflow.status_code == 409

    # Existing member re-opening invite remains idempotent
    users["active"]["current"] = users["guest"]
    repeat = client.post("/api/invites/SNOW2026/join", json={"display_name": "Guest"})
    assert repeat.status_code == 200
    assert repeat.json()["already_joined"] is True

    # Draw succeeds once 3 of 3 joined
    users["active"]["current"] = users["organizer"]
    drawn = client.post(f"/api/exchanges/{ex_id}/draw")
    assert drawn.status_code == 200
    assert drawn.json()["participant_count"] == 3

    # Reset and remove limit -> reverts to default open-ended behavior
    assert client.post(f"/api/exchanges/{ex_id}/reset-draw").status_code == 200
    state["exchanges"][ex_id]["target_participants"] = None

    users["active"]["current"] = AuthenticatedUser(user_id="user-fourth", email="fourth@example.com")
    fourth = client.post("/api/invites/SNOW2026/join", json={"display_name": "Fourth"})
    assert fourth.status_code == 200
    assert fourth.json()["already_joined"] is False

    users["active"]["current"] = users["organizer"]
    drawn_four = client.post(f"/api/exchanges/{ex_id}/draw")
    assert drawn_four.status_code == 200
    assert drawn_four.json()["participant_count"] == 4


def test_qa_messages_identity_guard_and_realtime_fanout(seeded_env) -> None:
    client, state, users, ex_id = seeded_env
    alice = AuthenticatedUser(user_id="user-alice", email="alice@example.com", name="Alice")
    outsider = AuthenticatedUser(user_id="user-outsider", email="out@example.com", name="Outsider")

    # Join guest so we have 3 participants, but test 409 while exchange is still open
    users["active"]["current"] = users["guest"]
    assert client.post("/api/invites/SNOW2026/join", json={"display_name": "Guest"}).status_code == 200

    open_res = client.post(
        f"/api/exchanges/{ex_id}/qa/messages",
        json={
            "assignment_id": str(uuid4()),
            "sender_role": "santa",
            "body": "Too early!",
        },
    )
    assert open_res.status_code == 409

    # Draw names
    users["active"]["current"] = users["organizer"]
    assert client.post(f"/api/exchanges/{ex_id}/draw").status_code == 200

    # Pick an assignment where user-org is giver
    org_asgn = next(a for a in state["assignments"] if a["giver_id"] == "user-org")
    other_uid = next(
        uid
        for uid in ("user-alice", "user-guest")
        if uid != org_asgn["recipient_id"]
    )
    recipient_user = alice if org_asgn["recipient_id"] == "user-alice" else users["guest"]

    # Subscribe all 3 users to qa_broker for this exchange
    ex_key = str(ex_id)
    q_org = qa_broker.subscribe(ex_key, "user-org")
    q_recipient = qa_broker.subscribe(ex_key, org_asgn["recipient_id"])
    q_bystander = qa_broker.subscribe(ex_key, other_uid)
    try:
        # 1. Wrong role returns 403
        users["active"]["current"] = users["organizer"]
        wrong_role = client.post(
            f"/api/exchanges/{ex_id}/qa/messages",
            json={
                "assignment_id": str(org_asgn["id"]),
                "sender_role": "recipient",
                "body": "Trying wrong role",
            },
        )
        assert wrong_role.status_code == 403

        # 2. Identity reveal blocked with 422 and NOT persisted
        blocked = client.post(
            f"/api/exchanges/{ex_id}/qa/messages",
            json={
                "assignment_id": str(org_asgn["id"]),
                "sender_role": "santa",
                "body": "Hey, it's Organizer! Check org@example.com",
            },
        )
        assert blocked.status_code == 422
        assert len(state["anonymous_messages"]) == 0

        # 3. Valid send returns 201 and pushes ONLY to giver & recipient queues
        valid = client.post(
            f"/api/exchanges/{ex_id}/qa/messages",
            json={
                "assignment_id": str(org_asgn["id"]),
                "sender_role": "santa",
                "body": "Hi, I'm your Secret Santa! Do you prefer coffee or tea?",
            },
        )
        assert valid.status_code == 201
        body = valid.json()
        assert body["sender_role"] == "santa"
        assert body["body"] == "Hi, I'm your Secret Santa! Do you prefer coffee or tea?"
        assert "giver_id" not in body
        assert "recipient_id" not in body
        assert len(state["anonymous_messages"]) == 1

        assert not q_org.empty()
        assert not q_recipient.empty()
        assert q_bystander.empty()

        pushed = q_recipient.get_nowait()
        assert pushed["event"] == "qa_message"
        assert pushed["data"]["id"] == body["id"]
        assert "giver_id" not in pushed["data"]
        assert "recipient_id" not in pushed["data"]

        # Recipient reply works too
        users["active"]["current"] = recipient_user
        reply = client.post(
            f"/api/exchanges/{ex_id}/qa/messages",
            json={
                "assignment_id": str(org_asgn["id"]),
                "sender_role": "recipient",
                "body": "Coffee please!",
            },
        )
        assert reply.status_code == 201
        assert reply.json()["sender_role"] == "recipient"

        # 4. Webhook & SSE access control
        users["active"]["current"] = outsider
        assert (
            client.post(f"/api/exchanges/{ex_id}/qa-webhook", json={"event": "message_created"}).status_code
            == 403
        )
        assert client.get(f"/api/exchanges/{ex_id}/qa-stream").status_code == 403
        assert client.get(f"/api/exchanges/{uuid4()}/qa-stream").status_code == 404

        users["active"]["current"] = users["organizer"]
        webhook_ok = client.post(
            f"/api/exchanges/{ex_id}/qa-webhook",
            json={"event": "message_created", "assignment_id": str(org_asgn["id"])},
        )
        assert webhook_ok.status_code == 200
        assert webhook_ok.json()["status"] == "broadcast"
        assert webhook_ok.json()["delivered"] >= 2
    finally:
        qa_broker.unsubscribe(ex_key, "user-org", q_org)
        qa_broker.unsubscribe(ex_key, org_asgn["recipient_id"], q_recipient)
        qa_broker.unsubscribe(ex_key, other_uid, q_bystander)


def test_qa_rejects_completed_exchange_and_enforces_limits(seeded_env) -> None:
    client, state, users, ex_id = seeded_env

    users["active"]["current"] = users["guest"]
    assert client.post("/api/invites/SNOW2026/join", json={"display_name": "Guest"}).status_code == 200

    users["active"]["current"] = users["organizer"]
    assert client.post(f"/api/exchanges/{ex_id}/draw").status_code == 200
    org_asgn = next(a for a in state["assignments"] if a["giver_id"] == "user-org")

    # 1. Completed exchange blocks new Q&A messages with 409
    state["exchanges"][ex_id]["status"] = "completed"
    completed_res = client.post(
        f"/api/exchanges/{ex_id}/qa/messages",
        json={
            "assignment_id": str(org_asgn["id"]),
            "sender_role": "santa",
            "body": "Hope you liked your gift!",
        },
    )
    assert completed_res.status_code == 409

    # 2. Per-thread message cap blocks inserts at MAX_MESSAGES_PER_THREAD
    state["exchanges"][ex_id]["status"] = "drawn"
    qa_message_limiter.reset()
    state["anonymous_messages"].extend(
        {
            "id": uuid4(),
            "exchange_id": ex_id,
            "assignment_id": org_asgn["id"],
            "sender_role": "santa",
            "body": f"Message {i}",
            "created_at": datetime.now(timezone.utc),
        }
        for i in range(MAX_MESSAGES_PER_THREAD)
    )
    capped_res = client.post(
        f"/api/exchanges/{ex_id}/qa/messages",
        json={
            "assignment_id": str(org_asgn["id"]),
            "sender_role": "santa",
            "body": "One message too many",
        },
    )
    assert capped_res.status_code == 429

    # 3. Message rate limit returns 429 with Retry-After header after 15 requests/min
    state["anonymous_messages"].clear()
    qa_message_limiter.reset()
    for i in range(15):
        res = client.post(
            f"/api/exchanges/{ex_id}/qa/messages",
            json={
                "assignment_id": str(org_asgn["id"]),
                "sender_role": "santa",
                "body": f"Question {i}",
            },
        )
        assert res.status_code == 201

    rate_limited_msg = client.post(
        f"/api/exchanges/{ex_id}/qa/messages",
        json={
            "assignment_id": str(org_asgn["id"]),
            "sender_role": "santa",
            "body": "Question 16",
        },
    )
    assert rate_limited_msg.status_code == 429
    assert int(rate_limited_msg.headers["Retry-After"]) >= 1

    # 4. Webhook rate limit returns 429 with Retry-After header after 10 requests/min
    qa_webhook_limiter.reset()
    for _ in range(10):
        res = client.post(
            f"/api/exchanges/{ex_id}/qa-webhook",
            json={"event": "message_created", "assignment_id": str(org_asgn["id"])},
        )
        assert res.status_code == 200

    rate_limited_hook = client.post(
        f"/api/exchanges/{ex_id}/qa-webhook",
        json={"event": "message_created", "assignment_id": str(org_asgn["id"])},
    )
    assert rate_limited_hook.status_code == 429
    assert int(rate_limited_hook.headers["Retry-After"]) >= 1
