from app.identity_guard import check_identity_leak


def test_allows_normal_anonymous_questions() -> None:
    samples = [
        "Hi, I'm your Secret Santa! Do you prefer hot tea or pour-over coffee?",
        "Hi, I'm your Anonymous Gifter! Do you prefer hot tea or pour-over coffee?",
        "Cheers, Anonymous Gifter",
        "Have a great week - Gifter",
        "Hey Alice, do you wear size M or L for cozy sweaters?",
        "Any book genres you want to avoid this winter?",
        "Joy and happiness! Should I ship to your office or bring it Friday?",
        "Hi Bruno, do you prefer tea or coffee?",
        "It's cold here, want warm socks?",
        "Just checking here, M or L?",
        "It's going to be a fun swap!",
        "Do you order from Amazon?",
    ]
    for msg in samples:
        res = check_identity_leak(
            msg,
            display_name="Alex Rivera",
            alias="StudioElf",
            account_name="Alex Rivera",
            email="alex.rivera@example.com",
        )
        assert not res.blocked, f"Unexpectedly blocked normal question: {msg!r} ({res.reason})"


def test_blocks_name_alias_and_email_variants() -> None:
    ctx = dict(
        display_name="Alex Rivera",
        alias="MapleFox",
        account_name="Alex Rivera",
        email="arivera99@example.com",
    )

    blocked_samples = [
        "Guess what, it's Alex Rivera!",
        "Hey, Alex here — what size?",
        "Ask Rivera at the front desk.",
        "Call me MapleFox if you need anything.",
        "Email me at arivera99@example.com",
        "My handle is arivera99",
        "It's 4l3x!",
        "Secret clue: A l e x",
        "Look closer: a.l.e.x",
        "Zero width test: Al\u200bex",
    ]
    for msg in blocked_samples:
        res = check_identity_leak(msg, **ctx)
        assert res.blocked, f"Expected identity leak to be blocked: {msg!r}"
        assert res.reason


def test_blocks_self_revelations_and_contact_info() -> None:
    ctx = dict(
        display_name="Jordan Lee",
        alias="",
        account_name="Jordan Lee",
        email="jordan@example.com",
    )

    blocked_samples = [
        "My name is someone in accounting.",
        "You can call me J!",
        "My initials are J.L.",
        "My name starts with J.",
        "I'm the host of this swap!",
        "I created this exchange for everyone.",
        "Enjoy the gift!\nCheers, Buddy",
        "Have a great week - Bob",
        "Text me at (415) 555-0199",
        "Call 4155550199 later",
        "Reach me at someone@gmail.com",
        "Follow me @coolgifter on socials",
        "Check https://instagram.com/coolgifter",
        "Ping me on https://x.com/coolgifter",
        "hi bruno. vee here",
        "Vee here, what size?",
        "Hey Bruno, it's Vee",
        "This is Vee",
        "guess what, it's me!",
        "Hi Bruno. From Vee",
    ]
    for msg in blocked_samples:
        res = check_identity_leak(msg, **ctx)
        assert res.blocked, f"Expected contact/confession leak to be blocked: {msg!r}"
        assert res.reason
