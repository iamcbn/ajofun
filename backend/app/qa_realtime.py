from asyncio import Queue, QueueEmpty, QueueFull
from collections import defaultdict, deque
from collections.abc import Iterable
import math
import time
from typing import Any


class SlidingWindowRateLimiter:
    """In-memory per-key sliding-window rate limiter."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = {}

    def check_and_record(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - self._window_seconds

        if len(self._buckets) > 1024:
            stale_keys = [k for k, q in self._buckets.items() if not q or q[-1] <= cutoff]
            for stale_key in stale_keys:
                self._buckets.pop(stale_key, None)

        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = deque()
            self._buckets[key] = bucket

        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self._max_requests:
            retry_after = max(1, math.ceil(self._window_seconds - (now - bucket[0])))
            return False, retry_after

        bucket.append(now)
        return True, 0

    def reset(self) -> None:
        self._buckets.clear()


class QARealtimeBroker:
    """In-memory per-user SSE subscriber broker keyed by (exchange_id, user_id)."""

    def __init__(self, max_queue_size: int = 100, max_queues_per_user: int = 5) -> None:
        self._max_queue_size = max_queue_size
        self._max_queues_per_user = max_queues_per_user
        self._subscribers: dict[str, dict[str, set[Queue[dict[str, Any]]]]] = defaultdict(
            lambda: defaultdict(set)
        )

    def subscribe(self, exchange_id: str, user_id: str) -> Queue[dict[str, Any]]:
        user_queues = self._subscribers[exchange_id][user_id]
        if len(user_queues) >= self._max_queues_per_user:
            raise RuntimeError("Concurrent SSE connection limit exceeded for user.")
        queue: Queue[dict[str, Any]] = Queue(maxsize=self._max_queue_size)
        user_queues.add(queue)
        return queue

    def unsubscribe(
        self,
        exchange_id: str,
        user_id: str,
        queue: Queue[dict[str, Any]],
    ) -> None:
        exchange_map = self._subscribers.get(exchange_id)
        if not exchange_map:
            return
        user_queues = exchange_map.get(user_id)
        if not user_queues:
            return
        user_queues.discard(queue)
        if not user_queues:
            exchange_map.pop(user_id, None)
        if not exchange_map:
            self._subscribers.pop(exchange_id, None)

    def _enqueue(
        self,
        queue: Queue[dict[str, Any]],
        exchange_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> bool:
        item = {"event": event_type, "data": payload}
        try:
            queue.put_nowait(item)
            return True
        except QueueFull:
            try:
                queue.get_nowait()
            except QueueEmpty:
                pass
            try:
                queue.put_nowait(
                    {"event": "sync_required", "data": {"exchange_id": exchange_id}}
                )
                return True
            except QueueFull:
                return False

    def publish_to_users(
        self,
        exchange_id: str,
        user_ids: Iterable[str],
        event_type: str,
        payload: dict[str, Any],
    ) -> int:
        exchange_map = self._subscribers.get(exchange_id)
        if not exchange_map:
            return 0
        delivered = 0
        for uid in set(user_ids):
            for queue in list(exchange_map.get(uid, set())):
                if self._enqueue(queue, exchange_id, event_type, payload):
                    delivered += 1
        return delivered

    def publish_to_exchange(
        self,
        exchange_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> int:
        exchange_map = self._subscribers.get(exchange_id)
        if not exchange_map:
            return 0
        delivered = 0
        for queues in list(exchange_map.values()):
            for queue in list(queues):
                if self._enqueue(queue, exchange_id, event_type, payload):
                    delivered += 1
        return delivered


qa_broker = QARealtimeBroker()
qa_message_limiter = SlidingWindowRateLimiter(max_requests=15, window_seconds=60.0)
qa_webhook_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60.0)
