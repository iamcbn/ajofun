/**
 * Sanitizes a post-auth redirect target to prevent open redirects.
 * Allows only relative in-app paths starting with a single '/' and no control chars.
 */
export function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) {
    return '/';
  }
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    /[\u0000-\u001F\u007F\\]/.test(trimmed)
  ) {
    return '/';
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return '/';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

/**
 * Validates an external link URL. Only http: and https: protocols are allowed.
 * Returns normalized URL string, or null if empty, or throws Error if unsafe.
 */
export function validateExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Please enter a valid URL starting with https:// or http://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// links are allowed.');
  }
  return parsed.toString();
}

/**
 * Formats an optional budget amount and currency code cleanly for display.
 */
export function formatBudget(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return 'No fixed budget';
  }
  const code = (currency || '').trim() || 'NGN';
  const maxFrac = amount % 1 === 0 ? 0 : 2;
  if (/^[A-Za-z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code.toUpperCase(),
        maximumFractionDigits: maxFrac,
      }).format(amount);
    } catch {
      // Fallback for non-standard 3-letter codes
    }
  }
  return `${code} ${amount.toLocaleString(undefined, { maximumFractionDigits: maxFrac })}`;
}

/**
 * Formats a participant's verified account name alongside their optional alias.
 */
export function formatParticipantName(displayName: string, alias?: string | null): string {
  const cleanName = displayName.trim();
  const cleanAlias = (alias ?? '').trim();
  if (cleanAlias && cleanAlias.toLowerCase() !== cleanName.toLowerCase()) {
    return `${cleanName} (${cleanAlias})`;
  }
  return cleanName;
}

/**
 * Formats a YYYY-MM-DD date string without timezone off-by-one drift.
 */
export function formatExchangeDate(dateStr: string | null): string {
  if (!dateStr) {
    return 'Date TBD';
  }
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return dateStr;
  }
  const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
  return localDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns tomorrow's local calendar date formatted as YYYY-MM-DD
 * without UTC/toISOString off-by-one drift.
 */
export function getTomorrowLocalDateString(now: Date = new Date()): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const year = String(tomorrow.getFullYear()).padStart(4, '0');
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface SenderIdentityContext {
  displayName?: string | null;
  alias?: string | null;
  email?: string | null;
  accountName?: string | null;
}

export interface IdentityLeakCheckResult {
  blocked: boolean;
  reason: string | null;
  matchedTerm: string | null;
}

const COMMON_ENGLISH_WORDS = new Set([
  'the', 'and', 'for', 'you', 'are', 'not', 'but', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
  'may', 'joy', 'art', 'red', 'tea', 'mug', 'box', 'bag', 'hat', 'cup', 'pen', 'book', 'gift',
  'santa', 'gifter', 'secret', 'match', 'will', 'hope', 'like', 'love', 'want', 'need', 'just', 'from',
  'with', 'have', 'this', 'that', 'what', 'when', 'where', 'which', 'your', 'here', 'there',
]);

const NON_NAME_HERE_WORDS = new Set([
  'santa', 'gifter', 'secret', 'just', 'still', 'not', 'back', 'right', 'over', 'up', 'down', 'out',
  'in', 'from', 'around', 'new', 'almost', 'nearly', 'already', 'always', 'never', 'also',
  'only', 'even', 'both', 'all', 'none', 'some', 'any', 'every', 'very', 'so', 'too', 'no',
  'yes', 'yeah', 'hey', 'hi', 'hello', 'well', 'ok', 'okay', 'wait', 'look', 'see', 'come',
  'go', 'stay', 'be', 'am', 'is', 'are', 'was', 'were', 'been', 'living', 'working',
  'sitting', 'waiting', 'typing', 'writing', 'asking', 'checking', 'hoping', 'wishing',
  'freezing', 'snowing', 'raining', 'cold', 'warm', 'hot', 'dark', 'late', 'early', 'quick',
  'short', 'long', 'good', 'great', 'nice', 'fine', 'happy', 'glad', 'sorry', 'thanks',
  'thank', 'please', 'question', 'note', 'hint', 'clue', 'gift', 'present', 'package',
  'parcel', 'delivery', 'shipping', 'size', 'color', 'coffee', 'tea', 'book', 'list',
  'wishlist', 'nothing', 'something', 'anything', 'everything', 'nobody', 'somebody',
  'anybody', 'everybody', 'who', 'what', 'where', 'when', 'why', 'how', 'we', 'they', 'it',
  'he', 'she', 'you', 'i', 'me', 'us', 'them', 'him', 'her', 'this', 'that', 'these',
  'those', 'there', 'then', 'now',
]);

const NON_NAME_INTRO_WORDS = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'not', 'no', 'so', 'very',
  'really', 'just', 'only', 'still', 'already', 'almost', 'about', 'for', 'from', 'to',
  'in', 'on', 'at', 'of', 'with', 'by', 'santa', 'gifter', 'secret', 'ok', 'okay', 'fine', 'good',
  'great', 'nice', 'cool', 'fun', 'easy', 'hard', 'cold', 'warm', 'hot', 'late', 'early',
  'true', 'false', 'real', 'possible', 'impossible', 'important', 'helpful', 'useful',
  'better', 'best', 'worse', 'worst', 'time', 'going', 'coming', 'snowing', 'raining',
  'getting', 'looking', 'working', 'happening', 'done', 'ready', 'here', 'there',
  'something', 'nothing', 'anything', 'everything', 'someone', 'anyone', 'everyone',
  'either', 'neither', 'both', 'all', 'one', 'two', 'three', 'small', 'medium', 'large',
  'extra', 'blue', 'red', 'green', 'black', 'white', 'pink', 'purple', 'yellow', 'orange',
  'brown', 'gray', 'grey', 'gold', 'silver', 'free', 'cheap', 'expensive', 'worth', 'up',
  'down', 'out', 'off', 'over', 'under', 'super', 'pretty', 'quite', 'too', 'much', 'more',
  'less', 'such', 'what', 'why', 'how', 'when', 'where', 'who', 'which', 'that', 'this',
  'because', 'like', 'kind', 'sort', 'way', 'alright', 'actually', 'probably', 'definitely',
  'maybe', 'hopefully', 'totally', 'completely', 'mostly', 'mainly', 'basically',
  'honestly', 'literally', 'seriously', 'obviously', 'clearly', 'simply', 'purely',
  'fairly', 'rather', 'especially', 'particularly', 'usually', 'normally', 'generally',
  'currently', 'recently', 'finally', 'soon', 'later', 'today', 'tomorrow', 'tonight',
  'gift', 'present', 'surprise', 'anonymous', 'private', 'blind', 'random', 'optional',
  'required', 'locked', 'sealed', 'open', 'closed', 'full', 'empty', 'blank', 'dark',
  'light', 'sweet', 'spicy', 'sour', 'salty', 'bitter', 'iced', 'decaf', 'whole', 'ground',
  'loose', 'bagged', 'paperback', 'hardcover', 'digital', 'physical', 'handmade',
  'homemade', 'local', 'vintage', 'used', 'new', 'old', 'big', 'little', 'tiny', 'huge',
  'tall', 'short', 'wide', 'narrow', 'soft', 'cozy', 'comfy', 'cute', 'funny', 'weird',
  'crazy', 'awesome', 'amazing', 'wonderful', 'lovely', 'perfect', 'ideal',
]);

const NON_NAME_FROM_WORDS = new Set([
  'santa', 'gifter', 'secret', 'your', 'the', 'a', 'an', 'my', 'our', 'this', 'that', 'here', 'there',
  'home', 'work', 'online', 'amazon', 'etsy', 'target', 'walmart', 'above', 'below',
]);

function stripZeroWidth(input: string): string {
  return input.replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function normalizeLeetspeak(input: string): string {
  return stripZeroWidth(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inspects an outgoing anonymous Q&A message for accidental or deliberate self-identification.
 * Blocks sender names, aliases, email handles, phone numbers, social handles, and confession phrases.
 */
export function detectIdentityLeak(
  body: string,
  sender: SenderIdentityContext,
): IdentityLeakCheckResult {
  const trimmed = stripZeroWidth(body).trim();
  if (!trimmed) {
    return { blocked: false, reason: null, matchedTerm: null };
  }

  const lower = trimmed.toLowerCase();
  const normalizedWords = normalizeLeetspeak(trimmed);
  // Also build a collapsed string (letters/digits only) to catch spaced-out names like "a l e x" or "a.l.e.x"
  const collapsedAlphaNum = normalizedWords.replace(/[^a-z0-9]/g, '');

  // 1. Check email address or email local-part
  if (sender.email) {
    const cleanEmail = stripZeroWidth(sender.email).trim().toLowerCase();
    if (cleanEmail && lower.includes(cleanEmail)) {
      return {
        blocked: true,
        reason: 'Your message contains your email address. Remove it to stay anonymous.',
        matchedTerm: sender.email.trim(),
      };
    }
    const localPart = cleanEmail.split('@')[0]?.replace(/[^a-z0-9]/g, '') ?? '';
    if (localPart.length >= 4 && !COMMON_ENGLISH_WORDS.has(localPart)) {
      const localRegex = new RegExp(`\\b${escapeRegExp(localPart)}\\b`, 'i');
      if (localRegex.test(normalizedWords)) {
        return {
          blocked: true,
          reason: `Your message includes your account handle ("${localPart}"). Remove it to stay anonymous.`,
          matchedTerm: localPart,
        };
      }
    }
  }

  // 2. Collect sender name & alias tokens
  const rawNames = [sender.displayName, sender.alias, sender.accountName]
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0);

  for (const fullName of rawNames) {
    const normFull = normalizeLeetspeak(fullName).trim();
    if (normFull.length >= 2) {
      const fullRegex = new RegExp(`\\b${escapeRegExp(normFull)}\\b`, 'i');
      if (fullRegex.test(normalizedWords)) {
        return {
          blocked: true,
          reason: `Your message mentions your name or alias ("${fullName}"). Remove it to stay anonymous.`,
          matchedTerm: fullName,
        };
      }

      const collapsedName = normFull.replace(/[^a-z0-9]/g, '');
      // Check spaced/dotted evasion like "a l e x" or "a.l.e.x"
      if (collapsedName.length >= 4) {
        const spacedPattern = collapsedName
          .split('')
          .map((ch) => escapeRegExp(ch))
          .join('[\\s._-]+');
        const spacedRegex = new RegExp(`\\b${spacedPattern}\\b`, 'i');
        if (spacedRegex.test(normalizedWords)) {
          return {
            blocked: true,
            reason: `Your message spells out your name ("${fullName}"). Remove it to stay anonymous.`,
            matchedTerm: fullName,
          };
        }
      }
    }

    // Check individual first/last name tokens (length >= 3 and not a generic English word)
    const tokens = fullName
      .split(/[\s._-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    for (const token of tokens) {
      const normToken = normalizeLeetspeak(token).replace(/[^a-z0-9]/g, '');
      if (normToken.length < 3 || COMMON_ENGLISH_WORDS.has(normToken)) {
        continue;
      }
      const tokenRegex = new RegExp(`\\b${escapeRegExp(normToken)}\\b`, 'i');
      if (tokenRegex.test(normalizedWords)) {
        return {
          blocked: true,
          reason: `Your message includes your name ("${token}"). Remove it to keep things anonymous.`,
          matchedTerm: token,
        };
      }
      // Also check spaced-out first name token (e.g. "a l e x")
      if (normToken.length >= 4 && collapsedAlphaNum.includes(normToken)) {
        const spacedTokenPattern = normToken
          .split('')
          .map((ch) => escapeRegExp(ch))
          .join('[\\s._-]+');
        const spacedTokenRegex = new RegExp(`(?:^|\\s)${spacedTokenPattern}(?:$|\\s|[.!?])`, 'i');
        if (spacedTokenRegex.test(normalizedWords)) {
          return {
            blocked: true,
            reason: `Your message spells out your name ("${token}"). Remove it to stay anonymous.`,
            matchedTerm: token,
          };
        }
      }
    }
  }

  // 3. Self-introduction clauses ("vee here", "it's vee", "this is vee", "it's me", "from vee")
  const clauseHereRegex = /(?:^|[.!?,;:\n]\s*|\s-\s*)([a-z]{2,20})\s+here(?:\s*[.!?,;:]|$)/gi;
  for (const match of trimmed.matchAll(clauseHereRegex)) {
    const candidate = (match[1] ?? '').toLowerCase();
    if (candidate && !NON_NAME_HERE_WORDS.has(candidate)) {
      return {
        blocked: true,
        reason: "It looks like you're signing in by name. Keep your message anonymous.",
        matchedTerm: match[1] ?? null,
      };
    }
  }

  if (/\b(?:it'?s|its|this\s+is)\s+me\b/i.test(trimmed)) {
    return {
      blocked: true,
      reason: "Self-identification phrases aren't allowed here. Keep your identity secret.",
      matchedTerm: null,
    };
  }

  const clauseIntroRegex =
    /(?:^|[.!?,;:\n]\s*|\s-\s*)(?:it'?s|its|this\s+is)\s+([a-z]{2,20})(?:\s*[.!?,;:]|$)/gi;
  for (const match of trimmed.matchAll(clauseIntroRegex)) {
    const candidate = (match[1] ?? '').toLowerCase();
    if (candidate && !NON_NAME_INTRO_WORDS.has(candidate)) {
      return {
        blocked: true,
        reason: "It looks like you're introducing yourself by name. Keep your identity secret.",
        matchedTerm: match[1] ?? null,
      };
    }
  }

  const clauseFromRegex = /(?:^|[.!?,;:\n]\s*|\s-\s*)from\s+([a-z]{2,20})(?:\s*[.!?]|$)/gi;
  for (const match of trimmed.matchAll(clauseFromRegex)) {
    const candidate = (match[1] ?? '').toLowerCase();
    if (candidate && !NON_NAME_FROM_WORDS.has(candidate)) {
      return {
        blocked: true,
        reason: "Signing off with a name isn't allowed in Anonymous Q&A.",
        matchedTerm: match[1] ?? null,
      };
    }
  }

  // 4. Explicit self-revelation / confession phrases & sign-offs
  const confessionPatterns: Array<{ regex: RegExp; label: string }> = [
    {
      regex:
        /\b(?:my\s+name\s+is|i\s+go\s+by|call\s+me|my\s+initials\s+are|my\s+name\s+starts\s+with|starts\s+with\s+the\s+letter)\b/i,
      label: 'introducing yourself or sharing name clues',
    },
    {
      regex: /\b(?:i\s+am|i'?m)\s+the\s+(?:host|organizer)\b|\bi\s+created\s+this\s+exchange\b/i,
      label: 'revealing that you are the exchange host',
    },
    {
      regex:
        /(?:^|\n)\s*(?:(?:love|cheers|best|sincerely|yours|signed|regards),|signed|from\s+your\s+friend,?)\s+(?!santa\b|gifter\b|anonymous\s+gifter\b)[a-z]{2,}/i,
      label: 'signing off your message with a name',
    },
    {
      regex: /(?:^|\s)-\s*(?!Santa\b|Gifter\b|Anonymous\s+Gifter\b)[A-Z][a-z]{2,}\s*$/,
      label: 'signing the end of the message with a name',
    },
  ];

  for (const pattern of confessionPatterns) {
    if (pattern.regex.test(trimmed)) {
      return {
        blocked: true,
        reason: `Blocked (${pattern.label}). Keep your Anonymous Gifter identity secret.`,
        matchedTerm: null,
      };
    }
  }

  // 5. Direct contact info (email addresses, phone numbers, social @handles, profile URLs)
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    return {
      blocked: true,
      reason: 'Sharing email addresses is blocked in Anonymous Q&A.',
      matchedTerm: null,
    };
  }

  if (
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.test(trimmed) ||
    /\b\d{10,14}\b/.test(trimmed)
  ) {
    return {
      blocked: true,
      reason: 'Sharing phone numbers is blocked in Anonymous Q&A.',
      matchedTerm: null,
    };
  }

  if (/(?:^|\s)@[a-zA-Z0-9_]{3,}\b/.test(trimmed)) {
    return {
      blocked: true,
      reason: 'Social media @handles are blocked in Anonymous Q&A.',
      matchedTerm: null,
    };
  }

  if (
    /(?:instagram\.com|twitter\.com|x\.com|linkedin\.com\/in|facebook\.com|tiktok\.com\/@|wa\.me|t\.me)\/[^\s]+/i.test(
      trimmed,
    )
  ) {
    return {
      blocked: true,
      reason: 'Social media profile links are blocked in Anonymous Q&A.',
      matchedTerm: null,
    };
  }

  return { blocked: false, reason: null, matchedTerm: null };
}
