from dataclasses import dataclass
import re
import unicodedata

COMMON_ENGLISH_WORDS = frozenset(
    {
        "the", "and", "for", "you", "are", "not", "but", "all", "any", "can", "had", "her", "was",
        "one", "our", "out", "day", "get", "has", "him", "his", "how", "man", "new", "now", "old",
        "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use",
        "may", "joy", "art", "red", "tea", "mug", "box", "bag", "hat", "cup", "pen", "book", "gift",
        "santa", "gifter", "secret", "match", "will", "hope", "like", "love", "want", "need", "just", "from",
        "with", "have", "this", "that", "what", "when", "where", "which", "your", "here", "there",
    }
)

NON_NAME_HERE_WORDS = frozenset(
    {
        "santa", "gifter", "secret", "just", "still", "not", "back", "right", "over", "up", "down", "out",
        "in", "from", "around", "new", "almost", "nearly", "already", "always", "never", "also",
        "only", "even", "both", "all", "none", "some", "any", "every", "very", "so", "too", "no",
        "yes", "yeah", "hey", "hi", "hello", "well", "ok", "okay", "wait", "look", "see", "come",
        "go", "stay", "be", "am", "is", "are", "was", "were", "been", "living", "working",
        "sitting", "waiting", "typing", "writing", "asking", "checking", "hoping", "wishing",
        "freezing", "snowing", "raining", "cold", "warm", "hot", "dark", "late", "early", "quick",
        "short", "long", "good", "great", "nice", "fine", "happy", "glad", "sorry", "thanks",
        "thank", "please", "question", "note", "hint", "clue", "gift", "present", "package",
        "parcel", "delivery", "shipping", "size", "color", "coffee", "tea", "book", "list",
        "wishlist", "nothing", "something", "anything", "everything", "nobody", "somebody",
        "anybody", "everybody", "who", "what", "where", "when", "why", "how", "we", "they", "it",
        "he", "she", "you", "i", "me", "us", "them", "him", "her", "this", "that", "these",
        "those", "there", "then", "now",
    }
)

NON_NAME_INTRO_WORDS = frozenset(
    {
        "a", "an", "the", "my", "your", "our", "their", "his", "her", "not", "no", "so", "very",
        "really", "just", "only", "still", "already", "almost", "about", "for", "from", "to",
        "in", "on", "at", "of", "with", "by", "santa", "gifter", "secret", "ok", "okay", "fine", "good",
        "great", "nice", "cool", "fun", "easy", "hard", "cold", "warm", "hot", "late", "early",
        "true", "false", "real", "possible", "impossible", "important", "helpful", "useful",
        "better", "best", "worse", "worst", "time", "going", "coming", "snowing", "raining",
        "getting", "looking", "working", "happening", "done", "ready", "here", "there",
        "something", "nothing", "anything", "everything", "someone", "anyone", "everyone",
        "either", "neither", "both", "all", "one", "two", "three", "small", "medium", "large",
        "extra", "blue", "red", "green", "black", "white", "pink", "purple", "yellow", "orange",
        "brown", "gray", "grey", "gold", "silver", "free", "cheap", "expensive", "worth", "up",
        "down", "out", "off", "over", "under", "super", "pretty", "quite", "too", "much", "more",
        "less", "such", "what", "why", "how", "when", "where", "who", "which", "that", "this",
        "because", "like", "kind", "sort", "way", "alright", "actually", "probably", "definitely",
        "maybe", "hopefully", "totally", "completely", "mostly", "mainly", "basically",
        "honestly", "literally", "seriously", "obviously", "clearly", "simply", "purely",
        "fairly", "rather", "especially", "particularly", "usually", "normally", "generally",
        "currently", "recently", "finally", "soon", "later", "today", "tomorrow", "tonight",
        "gift", "present", "surprise", "anonymous", "private", "blind", "random", "optional",
        "required", "locked", "sealed", "open", "closed", "full", "empty", "blank", "dark",
        "light", "sweet", "spicy", "sour", "salty", "bitter", "iced", "decaf", "whole", "ground",
        "loose", "bagged", "paperback", "hardcover", "digital", "physical", "handmade",
        "homemade", "local", "vintage", "used", "new", "old", "big", "little", "tiny", "huge",
        "tall", "short", "wide", "narrow", "soft", "cozy", "comfy", "cute", "funny", "weird",
        "crazy", "awesome", "amazing", "wonderful", "lovely", "perfect", "ideal",
    }
)

NON_NAME_FROM_WORDS = frozenset(
    {
        "santa", "gifter", "secret", "your", "the", "a", "an", "my", "our", "this", "that", "here", "there",
        "home", "work", "online", "amazon", "etsy", "target", "walmart", "above", "below",
    }
)

_LEETSPEAK_TABLE = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
    }
)

_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200d\ufeff]")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_FORMATTED_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b")
_PHONE_DIGITS_RE = re.compile(r"\b\d{10,14}\b")
_SOCIAL_HANDLE_RE = re.compile(r"(?:^|\s)@[a-zA-Z0-9_]{3,}\b")
_SOCIAL_URL_RE = re.compile(
    r"(?:instagram\.com|twitter\.com|x\.com|linkedin\.com/in|facebook\.com|tiktok\.com/@|wa\.me|t\.me)/[^\s]+",
    re.IGNORECASE,
)

_CLAUSE_HERE_RE = re.compile(
    r"(?:^|[.!?,;:\n]\s*|\s-\s*)([a-z]{2,20})\s+here(?:\s*[.!?,;:]|$)",
    re.IGNORECASE,
)
_ITS_ME_RE = re.compile(r"\b(?:it'?s|its|this\s+is)\s+me\b", re.IGNORECASE)
_CLAUSE_INTRO_RE = re.compile(
    r"(?:^|[.!?,;:\n]\s*|\s-\s*)(?:it'?s|its|this\s+is)\s+([a-z]{2,20})(?:\s*[.!?,;:]|$)",
    re.IGNORECASE,
)
_CLAUSE_FROM_RE = re.compile(
    r"(?:^|[.!?,;:\n]\s*|\s-\s*)from\s+([a-z]{2,20})(?:\s*[.!?]|$)",
    re.IGNORECASE,
)

_CONFESSION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:my\s+name\s+is|i\s+go\s+by|call\s+me|my\s+initials\s+are|"
            r"my\s+name\s+starts\s+with|starts\s+with\s+the\s+letter)\b",
            re.IGNORECASE,
        ),
        "introducing yourself or sharing name clues",
    ),
    (
        re.compile(
            r"\b(?:i\s+am|i'?m)\s+the\s+(?:host|organizer)\b|\bi\s+created\s+this\s+exchange\b",
            re.IGNORECASE,
        ),
        "revealing that you are the exchange host",
    ),
    (
        re.compile(
            r"(?:^|\n)\s*(?:(?:love|cheers|best|sincerely|yours|signed|regards),|"
            r"signed|from\s+your\s+friend,?)\s+(?!santa\b|gifter\b|anonymous\s+gifter\b)[a-z]{2,}",
            re.IGNORECASE,
        ),
        "signing off your message with a name",
    ),
    (
        re.compile(r"(?:^|\s)-\s*(?!Santa\b|Gifter\b|Anonymous\s+Gifter\b)[A-Z][a-z]{2,}\s*$"),
        "signing the end of the message with a name",
    ),
)


@dataclass(frozen=True)
class IdentityCheckResult:
    blocked: bool
    reason: str | None = None


def strip_zero_width(text: str) -> str:
    return _ZERO_WIDTH_RE.sub("", text)


def normalize_leetspeak(text: str) -> str:
    cleaned = strip_zero_width(text)
    nfkd = unicodedata.normalize("NFKD", cleaned)
    without_marks = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return without_marks.lower().translate(_LEETSPEAK_TABLE)


def check_identity_leak(
    body: str,
    *,
    display_name: str | None = None,
    alias: str | None = None,
    account_name: str | None = None,
    email: str | None = None,
) -> IdentityCheckResult:
    """Inspect an outgoing anonymous Q&A message for self-identifying clues."""
    trimmed = strip_zero_width(body).strip()
    if not trimmed:
        return IdentityCheckResult(blocked=False)

    lower = trimmed.lower()
    normalized_words = normalize_leetspeak(trimmed)
    collapsed_alnum = re.sub(r"[^a-z0-9]", "", normalized_words)

    # 1. Sender email address or local-part handle
    if email:
        clean_email = strip_zero_width(email).strip().lower()
        if clean_email and clean_email in lower:
            return IdentityCheckResult(
                blocked=True,
                reason="Your message contains your email address. Remove it to stay anonymous.",
            )
        local_part = re.sub(r"[^a-z0-9]", "", clean_email.split("@")[0]) if "@" in clean_email else ""
        if len(local_part) >= 4 and local_part not in COMMON_ENGLISH_WORDS:
            if re.search(rf"\b{re.escape(local_part)}\b", normalized_words, re.IGNORECASE):
                return IdentityCheckResult(
                    blocked=True,
                    reason=f'Your message includes your account handle ("{local_part}"). Remove it to stay anonymous.',
                )

    # 2. Sender name, alias, and account name tokens
    raw_names = [
        name.strip()
        for name in (display_name, alias, account_name)
        if isinstance(name, str) and name.strip()
    ]

    for full_name in raw_names:
        norm_full = normalize_leetspeak(full_name).strip()
        if len(norm_full) >= 2:
            if re.search(rf"\b{re.escape(norm_full)}\b", normalized_words, re.IGNORECASE):
                return IdentityCheckResult(
                    blocked=True,
                    reason=f'Your message mentions your name or alias ("{full_name}"). Remove it to stay anonymous.',
                )

            collapsed_name = re.sub(r"[^a-z0-9]", "", norm_full)
            if len(collapsed_name) >= 4:
                spaced_pattern = r"[\s._-]+".join(re.escape(ch) for ch in collapsed_name)
                if re.search(rf"\b{spaced_pattern}\b", normalized_words, re.IGNORECASE):
                    return IdentityCheckResult(
                        blocked=True,
                        reason=f'Your message spells out your name ("{full_name}"). Remove it to stay anonymous.',
                    )

        tokens = [tok.strip() for tok in re.split(r"[\s._-]+", full_name) if len(tok.strip()) >= 3]
        for token in tokens:
            norm_token = re.sub(r"[^a-z0-9]", "", normalize_leetspeak(token))
            if len(norm_token) < 3 or norm_token in COMMON_ENGLISH_WORDS:
                continue
            if re.search(rf"\b{re.escape(norm_token)}\b", normalized_words, re.IGNORECASE):
                return IdentityCheckResult(
                    blocked=True,
                    reason=f'Your message includes your name ("{token}"). Remove it to keep things anonymous.',
                )
            if len(norm_token) >= 4 and norm_token in collapsed_alnum:
                spaced_token = r"[\s._-]+".join(re.escape(ch) for ch in norm_token)
                if re.search(rf"(?:^|\s){spaced_token}(?:$|\s|[.!?])", normalized_words, re.IGNORECASE):
                    return IdentityCheckResult(
                        blocked=True,
                        reason=f'Your message spells out your name ("{token}"). Remove it to stay anonymous.',
                    )

    # 3. Self-introduction clauses ("vee here", "it's vee", "this is vee", "it's me", "from vee")
    for match in _CLAUSE_HERE_RE.finditer(trimmed):
        candidate = match.group(1).lower()
        if candidate not in NON_NAME_HERE_WORDS:
            return IdentityCheckResult(
                blocked=True,
                reason="It looks like you're signing in by name. Keep your message anonymous.",
            )

    if _ITS_ME_RE.search(trimmed):
        return IdentityCheckResult(
            blocked=True,
            reason="Self-identification phrases aren't allowed here. Keep your identity secret.",
        )

    for match in _CLAUSE_INTRO_RE.finditer(trimmed):
        candidate = match.group(1).lower()
        if candidate not in NON_NAME_INTRO_WORDS:
            return IdentityCheckResult(
                blocked=True,
                reason="It looks like you're introducing yourself by name. Keep your identity secret.",
            )

    for match in _CLAUSE_FROM_RE.finditer(trimmed):
        candidate = match.group(1).lower()
        if candidate not in NON_NAME_FROM_WORDS:
            return IdentityCheckResult(
                blocked=True,
                reason="Signing off with a name isn't allowed in Anonymous Q&A.",
            )

    # 4. Explicit confession phrases & sign-offs
    for pattern, label in _CONFESSION_PATTERNS:
        if pattern.search(trimmed):
            return IdentityCheckResult(
                blocked=True,
                reason=f"Blocked ({label}). Keep your Anonymous Gifter identity secret.",
            )

    # 5. Direct contact info & social profiles
    if _EMAIL_RE.search(trimmed):
        return IdentityCheckResult(
            blocked=True,
            reason="Sharing email addresses is blocked in Anonymous Q&A.",
        )

    if _PHONE_FORMATTED_RE.search(trimmed) or _PHONE_DIGITS_RE.search(trimmed):
        return IdentityCheckResult(
            blocked=True,
            reason="Sharing phone numbers is blocked in Anonymous Q&A.",
        )

    if _SOCIAL_HANDLE_RE.search(trimmed):
        return IdentityCheckResult(
            blocked=True,
            reason="Social media @handles are blocked in Anonymous Q&A.",
        )

    if _SOCIAL_URL_RE.search(trimmed):
        return IdentityCheckResult(
            blocked=True,
            reason="Social media profile links are blocked in Anonymous Q&A.",
        )

    return IdentityCheckResult(blocked=False)
