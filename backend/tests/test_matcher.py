import random

import pytest

from app.matcher import (
    DrawError,
    ImpossibleDrawError,
    InsufficientParticipantsError,
    generate_assignments,
)


def _assert_valid_matching(
    participants: list[str],
    pairs: dict[str, str],
    exclusions: set[tuple[str, str]] | None = None,
) -> None:
    blocked = exclusions or set()
    assert set(pairs.keys()) == set(participants)
    assert set(pairs.values()) == set(participants)
    for giver, recipient in pairs.items():
        assert giver != recipient
        assert (giver, recipient) not in blocked


def test_three_person_draw() -> None:
    people = ["alice", "bob", "carol"]
    pairs = generate_assignments(people, rng=random.Random(42))
    _assert_valid_matching(people, pairs)


def test_ten_person_draw() -> None:
    people = [f"user-{i}" for i in range(10)]
    pairs = generate_assignments(people, rng=random.Random(7))
    _assert_valid_matching(people, pairs)


def test_mutual_couple_exclusions() -> None:
    people = [
        "p1", "p2",
        "p3", "p4",
        "p5", "p6",
        "p7", "p8",
        "p9", "p10",
    ]
    exclusions: set[tuple[str, str]] = set()
    for i in range(0, len(people), 2):
        a, b = people[i], people[i + 1]
        exclusions.add((a, b))
        exclusions.add((b, a))

    pairs = generate_assignments(people, exclusions=exclusions, rng=random.Random(99))
    _assert_valid_matching(people, pairs, exclusions)


def test_asymmetric_directed_exclusion() -> None:
    people = ["a", "b", "c", "d"]
    # 'a' cannot draw 'b', 'c' cannot draw 'a', 'b' cannot draw 'c' -> tight directed graph
    exclusions = {("a", "b"), ("c", "a"), ("b", "c")}
    pairs = generate_assignments(people, exclusions=exclusions, rng=random.Random(123))
    _assert_valid_matching(people, pairs, exclusions)


def test_impossible_exclusion_graph_raises() -> None:
    people = ["a", "b", "c"]
    # In a 3-person exchange, preventing a->b AND a->c leaves 'a' with zero options.
    exclusions = {("a", "b"), ("a", "c")}
    with pytest.raises(ImpossibleDrawError):
        generate_assignments(people, exclusions=exclusions, rng=random.Random(1))


def test_impossible_matching_four_people_star_raises() -> None:
    # a, b, c all exclude each other except d; only one can receive d, so impossible!
    people = ["a", "b", "c", "d"]
    exclusions = {
        ("a", "b"), ("a", "c"),
        ("b", "a"), ("b", "c"),
        ("c", "a"), ("c", "b"),
    }
    with pytest.raises(ImpossibleDrawError):
        generate_assignments(people, exclusions=exclusions, rng=random.Random(1))


def test_insufficient_participants_raises() -> None:
    with pytest.raises(InsufficientParticipantsError):
        generate_assignments(["only-one"])
    with pytest.raises(InsufficientParticipantsError):
        generate_assignments(["one", "two"])


def test_duplicate_participant_ids_raise() -> None:
    with pytest.raises(DrawError):
        generate_assignments(["a", "b", "a"])


def test_hundred_randomized_stress_runs() -> None:
    people = [f"u{i}" for i in range(12)]
    exclusions = {
        ("u0", "u1"), ("u1", "u0"),
        ("u2", "u3"), ("u3", "u2"),
        ("u4", "u5"), ("u5", "u4"),
        ("u6", "u7"),
    }
    for seed in range(100):
        pairs = generate_assignments(people, exclusions=exclusions, rng=random.Random(seed))
        _assert_valid_matching(people, pairs, exclusions)


def test_unsatisfiable_exclusions_terminate_within_budget() -> None:
    # 10 participants where first 6 can only give to the last 2 -> Hall condition violated
    people = [f"p{i}" for i in range(10)]
    exclusions: set[tuple[str, str]] = set()
    for giver in people[:6]:
        for recipient in people[:8]:
            if giver != recipient:
                exclusions.add((giver, recipient))

    with pytest.raises(ImpossibleDrawError):
        generate_assignments(people, exclusions=exclusions, rng=random.Random(42))

