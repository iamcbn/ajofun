import random
import secrets


class DrawError(ValueError):
    """Base error raised when a valid Anonymous Gifter matching cannot be produced."""


class InsufficientParticipantsError(DrawError):
    """Raised when fewer than 3 participants are present."""


class ImpossibleDrawError(DrawError):
    """Raised when exclusions make a valid Anonymous Gifter assignment impossible."""


def generate_assignments(
    participant_ids: list[str],
    exclusions: set[tuple[str, str]] | None = None,
    rng: random.Random | None = None,
) -> dict[str, str]:
    """Compute a randomized Anonymous Gifter bijection respecting self and custom exclusions.

    Uses Minimum Remaining Values (MRV) ordering with forward-checking backtracking so
    tightly constrained exclusion graphs succeed reliably in one pass.
    """
    if len(participant_ids) != len(set(participant_ids)):
        raise DrawError("Duplicate participant IDs provided.")

    if len(participant_ids) < 3:
        raise InsufficientParticipantsError(
            "At least 3 participants are required to draw Anonymous Gifter names."
        )

    blocked = exclusions or set()
    random_source = rng if rng is not None else secrets.SystemRandom()

    allowed: dict[str, list[str]] = {}
    for giver in participant_ids:
        candidates = [
            recipient
            for recipient in participant_ids
            if recipient != giver and (giver, recipient) not in blocked
        ]
        if not candidates:
            raise ImpossibleDrawError(
                "One or more participants have no eligible match under the current exclusion rules."
            )
        random_source.shuffle(candidates)
        allowed[giver] = candidates

    assignments: dict[str, str] = {}
    used_recipients: set[str] = set()
    unassigned = set(participant_ids)
    max_steps = 10000
    steps = 0

    def backtrack() -> bool:
        nonlocal steps
        steps += 1
        if steps > max_steps:
            return False
        if not unassigned:
            return True

        # Pick the giver with the fewest valid remaining recipients (MRV heuristic).
        best_giver: str | None = None
        best_options: list[str] = []
        best_count = len(participant_ids) + 1

        for giver in unassigned:
            options = [r for r in allowed[giver] if r not in used_recipients]
            if not options:
                return False  # Forward-check failure
            if len(options) < best_count:
                best_count = len(options)
                best_giver = giver
                best_options = options
                if best_count == 1:
                    break

        assert best_giver is not None
        unassigned.remove(best_giver)
        for recipient in best_options:
            assignments[best_giver] = recipient
            used_recipients.add(recipient)
            if backtrack():
                return True
            used_recipients.remove(recipient)
            del assignments[best_giver]
        unassigned.add(best_giver)
        return False

    if not backtrack():
        raise ImpossibleDrawError(
            "No valid Anonymous Gifter matching satisfies all exclusion rules. Remove an exclusion and try again."
        )

    _verify_invariants(participant_ids, assignments, blocked)
    return assignments


def _verify_invariants(
    participant_ids: list[str],
    assignments: dict[str, str],
    exclusions: set[tuple[str, str]],
) -> None:
    expected = set(participant_ids)
    if set(assignments.keys()) != expected or set(assignments.values()) != expected:
        raise DrawError("Generated assignments failed bijection check.")
    for giver, recipient in assignments.items():
        if giver == recipient:
            raise DrawError("Generated assignments contain a self-match.")
        if (giver, recipient) in exclusions:
            raise DrawError("Generated assignments violated an exclusion rule.")
