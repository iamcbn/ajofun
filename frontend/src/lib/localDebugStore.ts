import type {
  AnonymousMessage,
  AnonymousSenderRole,
  Assignment,
  DrawResponse,
  Exchange,
  Exclusion,
  InvitePreview,
  JoinExchangeResponse,
  Participant,
  ResetDrawResponse,
  UserProfile,
  WishlistItem,
} from '../types/database';
import { detectIdentityLeak, sanitizeRedirectPath, validateExternalUrl } from './validation';

const STORAGE_KEY = 'ajofun-local-debug-v1';

export class LocalDebugError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'LocalDebugError';
    this.status = status;
    this.code = code;
  }
}

export interface LocalSelectQuery {
  select?: string;
  eq?: Record<string, string>;
  order?: string;
  limit?: number;
}

export interface LocalJoinPayload {
  display_name: string;
  alias?: string;
  wishlist_items: WishlistItem[];
  dislikes: string;
  delivery_notes: string;
}

interface StoredDebugUser extends UserProfile {
  passwordHash?: string;
}

async function hashDebugPassword(email: string, password: string): Promise<string> {
  const input = `ajofun-debug-v1::${email.trim().toLowerCase()}::${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback non-plaintext multi-round digest if crypto.subtle is unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `fb-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

interface LocalDebugState {
  currentUserId: string | null;
  users: StoredDebugUser[];
  exchanges: Exchange[];
  participants: Participant[];
  exclusions: Exclusion[];
  assignments: Assignment[];
  anonymous_messages: AnonymousMessage[];
}

export interface LocalDebugSnapshot {
  currentUserId: string | null;
  users: UserProfile[];
  exchanges: Exchange[];
  simulateLoading?: boolean;
}

export const DEBUG_PERSONAS: UserProfile[] = [
  { id: 'user-alex', email: 'alex@example.com', name: 'Alex Rivera', emailVerified: true },
  { id: 'user-jordan', email: 'jordan@example.com', name: 'Jordan Lee', emailVerified: true },
  { id: 'user-sam', email: 'sam@example.com', name: 'Sam Patel', emailVerified: true },
  { id: 'user-taylor', email: 'taylor@example.com', name: 'Taylor Kim', emailVerified: true },
  { id: 'user-casey', email: 'casey@example.com', name: 'Casey Morgan', emailVerified: false },
];

function createSeedState(): LocalDebugState {
  const openExchangeId = 'ex-open-winter';
  const drawnExchangeId = 'ex-drawn-cozy';

  return {
    currentUserId: 'user-alex',
    users: DEBUG_PERSONAS.map((persona) => ({ ...persona })),
    exchanges: [
      {
        id: openExchangeId,
        title: 'Studio Holiday Swap',
        description:
          'Thoughtful handmade or small-shop gifts for our end-of-year studio get-together.',
        budget_amount: 35,
        currency: 'USD',
        exchange_date: '2026-12-18',
        target_participants: 5,
        invite_code: 'WINTER26',
        organizer_id: 'user-alex',
        status: 'open',
        drawn_at: null,
        created_at: '2026-11-18T14:00:00.000Z',
      },
      {
        id: drawnExchangeId,
        title: 'Winter Cabin Book Exchange',
        description:
          'Bring one favorite book and a warm mug treat for our weekend cabin trip.',
        budget_amount: 25,
        currency: 'USD',
        exchange_date: '2026-12-22',
        target_participants: 4,
        invite_code: 'COZY2026',
        organizer_id: 'user-alex',
        status: 'drawn',
        drawn_at: '2026-11-20T18:00:00.000Z',
        created_at: '2026-11-15T10:30:00.000Z',
      },
    ],
    participants: [
      // Open exchange participants (Casey is intentionally not joined yet for /join/WINTER26 testing)
      {
        id: 'part-open-alex',
        exchange_id: openExchangeId,
        user_id: 'user-alex',
        display_name: 'Alex Rivera',
        wishlist_items: [
          {
            title: 'Whole bean dark-roast espresso',
            url: 'https://example.com/espresso-beans',
            notes: 'Whole bean preferred, nothing flavored',
          },
          {
            title: 'Linen desk notebook (A5 dotted)',
            url: null,
            notes: 'Warm cream or forest green cover',
          },
        ],
        dislikes: 'No scented candles or hazelnut.',
        delivery_notes: 'Leave on my studio desk or bring to Friday lunch.',
        joined_at: '2026-11-18T14:05:00.000Z',
      },
      {
        id: 'part-open-jordan',
        exchange_id: openExchangeId,
        user_id: 'user-jordan',
        display_name: 'Jordan Lee',
        wishlist_items: [
          {
            title: 'Pour-over ceramic dripper',
            url: 'https://example.com/ceramic-dripper',
            notes: 'Size 02 matte white or speckled clay',
          },
          {
            title: 'Merino hiking socks (size M)',
            url: null,
            notes: 'Crew height',
          },
        ],
        dislikes: 'No mugs please (cabinet is full!).',
        delivery_notes: 'Hand off in person at the swap.',
        joined_at: '2026-11-18T15:10:00.000Z',
      },
      {
        id: 'part-open-sam',
        exchange_id: openExchangeId,
        user_id: 'user-sam',
        display_name: 'Sam Patel',
        wishlist_items: [
          {
            title: 'Cardamom chai loose-leaf tea tin',
            url: 'https://example.com/cardamom-chai',
            notes: 'Loose leaf or Assam blend',
          },
          {
            title: 'Brass mechanical pencil (0.5mm)',
            url: null,
            notes: '',
          },
        ],
        dislikes: 'Allergic to walnuts and pecans.',
        delivery_notes: 'Front reception cubby #4.',
        joined_at: '2026-11-19T09:20:00.000Z',
      },
      {
        id: 'part-open-taylor',
        exchange_id: openExchangeId,
        user_id: 'user-taylor',
        display_name: 'Taylor Kim',
        wishlist_items: [
          {
            title: 'Compact travel board game',
            url: 'https://example.com/travel-game',
            notes: '2-4 players, quick to teach',
          },
          {
            title: 'Dark chocolate sea salt bar',
            url: null,
            notes: '70% cacao or higher',
          },
        ],
        dislikes: 'No milk chocolate or loud novelty ornaments.',
        delivery_notes: 'Mail room shelf B or Friday party.',
        joined_at: '2026-11-19T11:45:00.000Z',
      },
      // Drawn exchange participants
      {
        id: 'part-drawn-alex',
        exchange_id: drawnExchangeId,
        user_id: 'user-alex',
        display_name: 'Alex Rivera',
        wishlist_items: [
          {
            title: 'A comforting mystery or architectural essay collection',
            url: null,
            notes: 'Paperback is great for packing',
          },
          {
            title: 'Peppermint herbal tea sachets',
            url: 'https://example.com/peppermint-tea',
            notes: 'Caffeine-free for late-night reading',
          },
        ],
        dislikes: 'Already read Station Eleven and Piranesi.',
        delivery_notes: 'Bring wrapped to the cabin Friday night.',
        joined_at: '2026-11-15T10:35:00.000Z',
      },
      {
        id: 'part-drawn-jordan',
        exchange_id: drawnExchangeId,
        user_id: 'user-jordan',
        display_name: 'Jordan Lee',
        wishlist_items: [
          {
            title: 'Short nature essays or field guide',
            url: 'https://example.com/nature-essays',
            notes: 'Illustrated editions welcome',
          },
        ],
        dislikes: 'No true crime.',
        delivery_notes: 'Cabin fireplace mantel.',
        joined_at: '2026-11-15T12:00:00.000Z',
      },
      {
        id: 'part-drawn-sam',
        exchange_id: drawnExchangeId,
        user_id: 'user-sam',
        display_name: 'Sam Patel',
        wishlist_items: [
          {
            title: 'Cozy sci-fi novella (Becky Chambers style)',
            url: 'https://example.com/cozy-scifi',
            notes: 'Standalone preferred over long series',
          },
          {
            title: 'Artisan hot cocoa mix',
            url: null,
            notes: 'Dairy-free if possible',
          },
        ],
        dislikes: 'No horror or heavy bleak endings; no tree nuts.',
        delivery_notes: 'Leave under the cabin tree.',
        joined_at: '2026-11-16T08:40:00.000Z',
      },
      {
        id: 'part-drawn-taylor',
        exchange_id: drawnExchangeId,
        user_id: 'user-taylor',
        display_name: 'Taylor Kim',
        wishlist_items: [
          {
            title: 'Speculative short story anthology',
            url: null,
            notes: 'Used/indie bookstore finds are a huge plus',
          },
        ],
        dislikes: 'No self-help business books.',
        delivery_notes: 'Cabin gift table.',
        joined_at: '2026-11-16T14:15:00.000Z',
      },
    ],
    exclusions: [
      {
        id: 'excl-alex-jordan',
        exchange_id: openExchangeId,
        giver_participant_id: 'part-open-alex',
        excluded_participant_id: 'part-open-jordan',
        created_at: '2026-11-19T16:00:00.000Z',
      },
      {
        id: 'excl-jordan-alex',
        exchange_id: openExchangeId,
        giver_participant_id: 'part-open-jordan',
        excluded_participant_id: 'part-open-alex',
        created_at: '2026-11-19T16:00:00.000Z',
      },
    ],
    assignments: [
      {
        id: 'asgn-alex-sam',
        exchange_id: drawnExchangeId,
        giver_id: 'user-alex',
        recipient_id: 'user-sam',
        revealed_at: null,
        created_at: '2026-11-20T18:00:00.000Z',
      },
      {
        id: 'asgn-sam-jordan',
        exchange_id: drawnExchangeId,
        giver_id: 'user-sam',
        recipient_id: 'user-jordan',
        revealed_at: '2026-11-20T18:15:00.000Z',
        created_at: '2026-11-20T18:00:00.000Z',
      },
      {
        id: 'asgn-jordan-taylor',
        exchange_id: drawnExchangeId,
        giver_id: 'user-jordan',
        recipient_id: 'user-taylor',
        revealed_at: '2026-11-20T18:20:00.000Z',
        created_at: '2026-11-20T18:00:00.000Z',
      },
      {
        id: 'asgn-taylor-alex',
        exchange_id: drawnExchangeId,
        giver_id: 'user-taylor',
        recipient_id: 'user-alex',
        revealed_at: '2026-11-20T18:30:00.000Z',
        created_at: '2026-11-20T18:00:00.000Z',
      },
    ],
    anonymous_messages: [
      {
        id: 'msg-1',
        exchange_id: drawnExchangeId,
        assignment_id: 'asgn-alex-sam',
        sender_role: 'santa',
        body: 'Have you already read A Psalm for the Wild-Built?',
        created_at: '2026-11-20T19:00:00.000Z',
      },
      {
        id: 'msg-2',
        exchange_id: drawnExchangeId,
        assignment_id: 'asgn-alex-sam',
        sender_role: 'recipient',
        body: 'I have read that one and loved it! Something in a similar vibe would be wonderful.',
        created_at: '2026-11-20T19:12:00.000Z',
      },
      {
        id: 'msg-3',
        exchange_id: drawnExchangeId,
        assignment_id: 'asgn-taylor-alex',
        sender_role: 'santa',
        body: 'Do you prefer hardcover or paperback?',
        created_at: '2026-11-21T10:05:00.000Z',
      },
    ],
  };
}

let memoryFallbackState: LocalDebugState | null = null;
let simulateLoadingPreview = false;
const listeners = new Set<() => void>();
const DEBUG_BROADCAST_CHANNEL = 'ajofun-live-qa-v1';

let debugChannel: BroadcastChannel | null = null;
if (__LOCAL_DEBUG__) {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      debugChannel = new BroadcastChannel(DEBUG_BROADCAST_CHANNEL);
      debugChannel.onmessage = () => {
        notifyListeners();
      };
    } catch {
      debugChannel = null;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        notifyListeners();
      }
    });
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeHydratedWishlistItems(raw: unknown): WishlistItem[] {
  if (!Array.isArray(raw)) return [];
  const items: WishlistItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 120) : '';
    if (!title) continue;
    let safeUrl: string | null = null;
    if (typeof rec.url === 'string' && rec.url.trim()) {
      try {
        safeUrl = validateExternalUrl(rec.url);
      } catch {
        safeUrl = null;
      }
    }
    const notes = typeof rec.notes === 'string' ? rec.notes.slice(0, 280) : '';
    items.push({ title, url: safeUrl, notes });
  }
  return items.slice(0, 20);
}

function loadState(): LocalDebugState {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalDebugState>;
        if (
          parsed &&
          Array.isArray(parsed.users) &&
          Array.isArray(parsed.exchanges) &&
          Array.isArray(parsed.participants) &&
          Array.isArray(parsed.exclusions) &&
          Array.isArray(parsed.assignments) &&
          Array.isArray(parsed.anonymous_messages)
        ) {
          const users: StoredDebugUser[] = parsed.users
            .filter(
              (u): u is StoredDebugUser =>
                Boolean(u) &&
                typeof u === 'object' &&
                typeof u.id === 'string' &&
                typeof u.email === 'string',
            )
            .map((u) => ({
              id: u.id,
              email: u.email,
              name: typeof u.name === 'string' ? u.name : null,
              emailVerified: typeof u.emailVerified === 'boolean' ? u.emailVerified : u.id !== 'user-casey',
              ...(typeof u.passwordHash === 'string' ? { passwordHash: u.passwordHash } : {}),
            }));

          const exchanges: Exchange[] = parsed.exchanges
            .filter(
              (ex): ex is Exchange =>
                Boolean(ex) &&
                typeof ex === 'object' &&
                typeof ex.id === 'string' &&
                typeof ex.title === 'string' &&
                typeof ex.invite_code === 'string' &&
                typeof ex.organizer_id === 'string',
            )
            .map((ex) => ({
              id: ex.id,
              title: ex.title,
              description: typeof ex.description === 'string' ? ex.description : '',
              budget_amount:
                typeof ex.budget_amount === 'number' && !Number.isNaN(ex.budget_amount)
                  ? ex.budget_amount
                  : null,
              currency: typeof ex.currency === 'string' && ex.currency.trim() ? ex.currency : 'NGN',
              exchange_date: typeof ex.exchange_date === 'string' ? ex.exchange_date : null,
              target_participants:
                typeof ex.target_participants === 'number' && Number.isInteger(ex.target_participants)
                  ? ex.target_participants
                  : null,
              invite_code: ex.invite_code,
              organizer_id: ex.organizer_id,
              status:
                ex.status === 'open' || ex.status === 'drawn' || ex.status === 'completed'
                  ? ex.status
                  : 'open',
              drawn_at: typeof ex.drawn_at === 'string' ? ex.drawn_at : null,
              created_at: typeof ex.created_at === 'string' ? ex.created_at : new Date().toISOString(),
            }));

          const participants: Participant[] = parsed.participants
            .filter(
              (p): p is Participant =>
                Boolean(p) &&
                typeof p === 'object' &&
                typeof p.id === 'string' &&
                typeof p.exchange_id === 'string' &&
                typeof p.user_id === 'string' &&
                typeof p.display_name === 'string',
            )
            .map((p) => ({
              id: p.id,
              exchange_id: p.exchange_id,
              user_id: p.user_id,
              display_name: p.display_name,
              alias: typeof p.alias === 'string' ? p.alias : '',
              wishlist_items: sanitizeHydratedWishlistItems(p.wishlist_items),
              dislikes: typeof p.dislikes === 'string' ? p.dislikes : '',
              delivery_notes: typeof p.delivery_notes === 'string' ? p.delivery_notes : '',
              joined_at: typeof p.joined_at === 'string' ? p.joined_at : new Date().toISOString(),
            }));

          const exclusions: Exclusion[] = parsed.exclusions.filter(
            (r): r is Exclusion =>
              Boolean(r) &&
              typeof r === 'object' &&
              typeof r.id === 'string' &&
              typeof r.exchange_id === 'string' &&
              typeof r.giver_participant_id === 'string' &&
              typeof r.excluded_participant_id === 'string',
          );

          const assignments: Assignment[] = parsed.assignments.filter(
            (a): a is Assignment =>
              Boolean(a) &&
              typeof a === 'object' &&
              typeof a.id === 'string' &&
              typeof a.exchange_id === 'string' &&
              typeof a.giver_id === 'string' &&
              typeof a.recipient_id === 'string',
          );

          const anonymous_messages: AnonymousMessage[] = parsed.anonymous_messages.filter(
            (m): m is AnonymousMessage =>
              Boolean(m) &&
              typeof m === 'object' &&
              typeof m.id === 'string' &&
              typeof m.exchange_id === 'string' &&
              typeof m.assignment_id === 'string' &&
              (m.sender_role === 'santa' || m.sender_role === 'recipient') &&
              typeof m.body === 'string',
          );

          const currentUserId =
            typeof parsed.currentUserId === 'string' &&
            users.some((u) => u.id === parsed.currentUserId)
              ? parsed.currentUserId
              : parsed.currentUserId === null
                ? null
                : 'user-alex';

          return {
            currentUserId,
            users,
            exchanges,
            participants,
            exclusions,
            assignments,
            anonymous_messages,
          };
        }
      }
    } catch {
      // Corrupted localStorage falls back to fresh seed data
    }
    const seeded = createSeedState();
    saveState(seeded, false);
    return seeded;
  }

  if (!memoryFallbackState) {
    memoryFallbackState = createSeedState();
  }
  return clone(memoryFallbackState);
}

function saveState(state: LocalDebugState, notify = true): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      memoryFallbackState = clone(state);
    }
  } else {
    memoryFallbackState = clone(state);
  }
  if (notify) {
    notifyListeners();
    try {
      debugChannel?.postMessage({ type: 'state-updated', ts: Date.now() });
    } catch {
      // Ignore BroadcastChannel errors
    }
  }
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateInviteCode(existingCodes: Set<string>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let code = '';
    for (let i = 0; i < 8; i += 1) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return `GIFT${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) {
        return buf[0] % maxExclusive;
      }
    }
  }
  return Math.floor(Math.random() * maxExclusive);
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = cryptoRandomInt(i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

function generateAssignments(
  participantIds: string[],
  blockedPairs: Set<string>,
): Map<string, string> {
  if (new Set(participantIds).size !== participantIds.length) {
    throw new LocalDebugError('Duplicate participant IDs provided.', 422);
  }
  if (participantIds.length < 3) {
    throw new LocalDebugError(
      'At least 3 participants are required to draw Anonymous Gifter names.',
      422,
    );
  }

  const allowed = new Map<string, string[]>();
  for (const giver of participantIds) {
    const candidates = participantIds.filter(
      (recipient) => recipient !== giver && !blockedPairs.has(`${giver}::${recipient}`),
    );
    if (candidates.length === 0) {
      throw new LocalDebugError(
        'One or more participants have no eligible match under the current exclusion rules.',
        422,
      );
    }
    shuffleInPlace(candidates);
    allowed.set(giver, candidates);
  }

  const assignments = new Map<string, string>();
  const usedRecipients = new Set<string>();
  const unassigned = new Set<string>(participantIds);

  const backtrack = (): boolean => {
    if (unassigned.size === 0) {
      return true;
    }

    let bestGiver: string | null = null;
    let bestOptions: string[] = [];
    let bestCount = participantIds.length + 1;

    for (const giver of unassigned) {
      const options = (allowed.get(giver) ?? []).filter((r) => !usedRecipients.has(r));
      if (options.length === 0) {
        return false;
      }
      if (options.length < bestCount) {
        bestCount = options.length;
        bestGiver = giver;
        bestOptions = options;
        if (bestCount === 1) {
          break;
        }
      }
    }

    if (!bestGiver) {
      return false;
    }

    unassigned.delete(bestGiver);
    for (const recipient of bestOptions) {
      assignments.set(bestGiver, recipient);
      usedRecipients.add(recipient);
      if (backtrack()) {
        return true;
      }
      usedRecipients.delete(recipient);
      assignments.delete(bestGiver);
    }
    unassigned.add(bestGiver);
    return false;
  };

  if (!backtrack()) {
    throw new LocalDebugError(
      'No valid Anonymous Gifter matching satisfies all exclusion rules. Remove an exclusion and try again.',
      422,
    );
  }

  return assignments;
}

interface PendingDebugOtp {
  otp: string;
  type: 'email-verification' | 'forget-password';
  expiresAt: number;
}

const pendingDebugOtps = new Map<string, PendingDebugOtp>();

function generateSixDigitOtp(): string {
  const num = cryptoRandomInt(1_000_000);
  return String(num).padStart(6, '0');
}

function otpKey(email: string, type: 'email-verification' | 'forget-password'): string {
  return `${type}::${email.trim().toLowerCase()}`;
}

function toProfile(user: StoredDebugUser): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    emailVerified: Boolean(user.emailVerified),
  };
}

function requireCurrentUser(state: LocalDebugState): string {
  if (!state.currentUserId) {
    throw new LocalDebugError('Please sign in to continue.', 401);
  }
  const exists = state.users.some((u) => u.id === state.currentUserId);
  if (!exists) {
    throw new LocalDebugError('Please sign in to continue.', 401);
  }
  return state.currentUserId;
}

function isExchangeOrganizer(state: LocalDebugState, exchangeId: string, userId: string): boolean {
  return state.exchanges.some((ex) => ex.id === exchangeId && ex.organizer_id === userId);
}

function isExchangeMember(state: LocalDebugState, exchangeId: string, userId: string): boolean {
  return state.participants.some((p) => p.exchange_id === exchangeId && p.user_id === userId);
}

function isExchangeOpen(state: LocalDebugState, exchangeId: string): boolean {
  return state.exchanges.some((ex) => ex.id === exchangeId && ex.status === 'open');
}

function isExchangeActive(state: LocalDebugState, exchangeId: string): boolean {
  return state.exchanges.some(
    (ex) => ex.id === exchangeId && (ex.status === 'open' || ex.status === 'drawn'),
  );
}

function applyQuery<T extends object>(rows: T[], query?: LocalSelectQuery): T[] {
  let result = rows.slice();
  if (query?.eq) {
    for (const [col, val] of Object.entries(query.eq)) {
      result = result.filter((row) => String((row as Record<string, unknown>)[col] ?? '') === val);
    }
  }
  if (query?.order) {
    const [col, dirRaw] = query.order.split('.');
    const desc = dirRaw?.toLowerCase() === 'desc';
    result.sort((a, b) => {
      const av = (a as Record<string, unknown>)[col];
      const bv = (b as Record<string, unknown>)[col];
      if (av === bv) return 0;
      if (av === null || av === undefined) return desc ? 1 : -1;
      if (bv === null || bv === undefined) return desc ? -1 : 1;
      const cmp = String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  }
  if (query?.limit !== undefined) {
    result = result.slice(0, query.limit);
  }
  return clone(result);
}

export function subscribeLocalDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isDebugLoadingPreview(): boolean {
  return simulateLoadingPreview;
}

export function setDebugLoadingPreview(active: boolean): void {
  simulateLoadingPreview = active;
  notifyListeners();
}

export function getLocalDebugSnapshot(): LocalDebugSnapshot {
  const state = loadState();
  return {
    currentUserId: state.currentUserId,
    users: state.users.map(toProfile),
    exchanges: clone(state.exchanges),
    simulateLoading: simulateLoadingPreview,
  };
}

export function switchDebugUser(userId: string | null): void {
  const state = loadState();
  if (userId === null) {
    state.currentUserId = null;
  } else {
    const found = state.users.find((u) => u.id === userId);
    if (!found) {
      throw new LocalDebugError('Selected debug persona was not found.', 404);
    }
    state.currentUserId = found.id;
  }
  saveState(state);
}

export function resetLocalDebugStore(): void {
  const seeded = createSeedState();
  saveState(seeded);
}

export async function debugGetSession(): Promise<UserProfile | null> {
  const state = loadState();
  if (!state.currentUserId) return null;
  const user = state.users.find((u) => u.id === state.currentUserId);
  return user ? toProfile(user) : null;
}

export async function debugGetJwt(): Promise<string | null> {
  const state = loadState();
  if (!state.currentUserId) return null;
  return `local-debug-token.${state.currentUserId}`;
}

export async function debugSignUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<{ user: UserProfile; requiresEmailVerification: boolean }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName) {
    throw new LocalDebugError('Please enter your name.', 400);
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new LocalDebugError('Please enter a valid email address.', 400);
  }
  if (password.length < 8) {
    throw new LocalDebugError('Password must be at least 8 characters.', 400);
  }

  const state = loadState();
  if (state.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    throw new LocalDebugError('An account with this email already exists.', 409);
  }

  const passwordHash = await hashDebugPassword(cleanEmail, password);
  const created: StoredDebugUser = {
    id: `user-${generateUuid().slice(0, 8)}`,
    email: cleanEmail,
    name: cleanName,
    passwordHash,
    emailVerified: false,
  };
  state.users.push(created);
  saveState(state);
  return {
    user: toProfile(created),
    requiresEmailVerification: true,
  };
}

export async function debugSignInWithEmail(
  email: string,
  password: string,
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || password.length < 8) {
    throw new LocalDebugError('Invalid email or password.', 401);
  }

  const state = loadState();
  const existing = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!existing) {
    throw new LocalDebugError('Invalid email or password.', 401);
  }
  if (existing.passwordHash !== undefined) {
    const candidateHash = await hashDebugPassword(cleanEmail, password);
    if (existing.passwordHash !== candidateHash) {
      throw new LocalDebugError('Invalid email or password.', 401);
    }
  }
  if (!existing.emailVerified) {
    throw new LocalDebugError(
      'Please verify your email address before signing in.',
      403,
      'EMAIL_NOT_VERIFIED',
    );
  }

  state.currentUserId = existing.id;
  saveState(state);
  return toProfile(existing);
}

export async function debugSendEmailVerificationOtp(
  email: string,
): Promise<{ debugOtp: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new LocalDebugError('Enter a valid email address.', 400);
  }
  const state = loadState();
  const exists = state.users.some((u) => u.email.toLowerCase() === cleanEmail);
  if (!exists) {
    throw new LocalDebugError('Account not found for that email.', 404);
  }
  const otp = generateSixDigitOtp();
  pendingDebugOtps.set(otpKey(cleanEmail, 'email-verification'), {
    otp,
    type: 'email-verification',
    expiresAt: Date.now() + 10 * 60_000,
  });
  return { debugOtp: otp };
}

export async function debugVerifyEmailWithOtp(
  email: string,
  otp: string,
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();
  const key = otpKey(cleanEmail, 'email-verification');
  const entry = pendingDebugOtps.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingDebugOtps.delete(key);
    throw new LocalDebugError('Verification code expired or not requested. Request a new code.', 400, 'INVALID_OTP');
  }
  if (entry.otp !== cleanOtp) {
    throw new LocalDebugError('Invalid verification code. Please try again.', 400, 'INVALID_OTP');
  }

  const state = loadState();
  const user = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    throw new LocalDebugError('Account not found.', 404);
  }
  user.emailVerified = true;
  state.currentUserId = user.id;
  pendingDebugOtps.delete(key);
  saveState(state);
  return toProfile(user);
}

export async function debugRequestPasswordResetOtp(
  email: string,
): Promise<{ debugOtp: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new LocalDebugError('Enter a valid email address.', 400);
  }
  const otp = generateSixDigitOtp();
  pendingDebugOtps.set(otpKey(cleanEmail, 'forget-password'), {
    otp,
    type: 'forget-password',
    expiresAt: Date.now() + 10 * 60_000,
  });
  return { debugOtp: otp };
}

export async function debugResetPasswordWithOtp(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();
  if (newPassword.length < 8) {
    throw new LocalDebugError('Password must be at least 8 characters.', 400);
  }
  const key = otpKey(cleanEmail, 'forget-password');
  const entry = pendingDebugOtps.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingDebugOtps.delete(key);
    throw new LocalDebugError('Reset code expired or not requested. Request a new code.', 400, 'INVALID_OTP');
  }
  if (entry.otp !== cleanOtp) {
    throw new LocalDebugError('Invalid reset code. Please check the 6-digit code and try again.', 400, 'INVALID_OTP');
  }

  const state = loadState();
  const user = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    throw new LocalDebugError('Account not found for that email.', 404);
  }
  user.passwordHash = await hashDebugPassword(cleanEmail, newPassword);
  user.emailVerified = true;
  if (state.currentUserId === user.id) {
    state.currentUserId = null;
  }
  pendingDebugOtps.delete(key);
  saveState(state);
}

export async function debugSignInWithGoogle(redirectPath: string): Promise<void> {
  const state = loadState();
  const fallbackUser = state.users[0]?.id ?? 'user-alex';
  const activeId =
    state.currentUserId && state.users.some((u) => u.id === state.currentUserId)
      ? state.currentUserId
      : fallbackUser;
  const activeUser = state.users.find((u) => u.id === activeId);
  if (activeUser) {
    activeUser.emailVerified = true;
  }
  state.currentUserId = activeId;
  saveState(state);

  const safePath = sanitizeRedirectPath(redirectPath);
  if (typeof window !== 'undefined') {
    window.location.assign(`${window.location.origin}${safePath}`);
  }
}

export async function debugSignOut(): Promise<void> {
  const state = loadState();
  state.currentUserId = null;
  saveState(state);
}

export async function debugSelect<T>(
  table: string,
  query?: LocalSelectQuery,
): Promise<T[]> {
  const state = loadState();
  const uid = requireCurrentUser(state);

  let rows: object[];
  switch (table) {
    case 'exchanges':
      rows = state.exchanges.filter(
        (ex) => ex.organizer_id === uid || isExchangeMember(state, ex.id, uid),
      );
      break;
    case 'participants':
      rows = state.participants.filter(
        (p) =>
          p.user_id === uid ||
          isExchangeMember(state, p.exchange_id, uid) ||
          isExchangeOrganizer(state, p.exchange_id, uid),
      );
      break;
    case 'exclusions':
      rows = state.exclusions.filter((rule) =>
        isExchangeOrganizer(state, rule.exchange_id, uid),
      );
      break;
    case 'assignments':
      rows = state.assignments.filter((asgn) => asgn.giver_id === uid);
      break;
    case 'anonymous_messages':
      rows = state.anonymous_messages.filter((msg) =>
        state.assignments.some(
          (asgn) =>
            asgn.id === msg.assignment_id &&
            (asgn.giver_id === uid || asgn.recipient_id === uid),
        ),
      );
      break;
    default:
      throw new LocalDebugError(`Unknown table: ${table}`, 404);
  }

  return applyQuery(rows, query) as T[];
}

export async function debugSelectSingle<T>(
  table: string,
  query: { select?: string; eq: Record<string, string> },
): Promise<T | null> {
  const rows = await debugSelect<T>(table, { ...query, limit: 1 });
  return rows[0] ?? null;
}

function parseTargetParticipants(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 3) {
    throw new LocalDebugError('Participant limit must be a whole number of at least 3.', 400);
  }
  return numeric;
}

export async function debugInsert<T>(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
): Promise<T[]> {
  const state = loadState();
  const uid = requireCurrentUser(state);
  const items = Array.isArray(payload) ? payload : [payload];
  const nowIso = new Date().toISOString();
  const createdRows: object[] = [];

  switch (table) {
    case 'exchanges': {
      const currentUser = state.users.find((u) => u.id === uid);
      if (!currentUser?.emailVerified) {
        throw new LocalDebugError(
          'Verify your email with a code before hosting an exchange.',
          403,
          'EMAIL_NOT_VERIFIED',
        );
      }
      const existingCodes = new Set(state.exchanges.map((e) => e.invite_code.toUpperCase()));
      for (const item of items) {
        const title = String(item.title ?? '').trim();
        if (title.length < 2 || title.length > 100) {
          throw new LocalDebugError('Exchange title must be between 2 and 100 characters.', 400);
        }
        const description = String(item.description ?? '');
        const rawBudget = item.budget_amount;
        const budgetAmount =
          rawBudget === null || rawBudget === undefined || rawBudget === ''
            ? null
            : Number(rawBudget);
        if (budgetAmount !== null && (Number.isNaN(budgetAmount) || budgetAmount < 0)) {
          throw new LocalDebugError('Budget must be zero or positive.', 400);
        }
        const targetParticipants = parseTargetParticipants(item.target_participants);
        const inviteCode = generateInviteCode(existingCodes);
        existingCodes.add(inviteCode);

        const row: Exchange = {
          id: generateUuid(),
          title,
          description,
          budget_amount: budgetAmount,
          currency: String(item.currency ?? 'NGN').trim() || 'NGN',
          exchange_date: item.exchange_date ? String(item.exchange_date) : null,
          target_participants: targetParticipants,
          invite_code: inviteCode,
          organizer_id: uid,
          status: 'open',
          drawn_at: null,
          created_at: nowIso,
        };
        state.exchanges.push(row);
        createdRows.push(row);
      }
      break;
    }

    case 'participants': {
      for (const item of items) {
        const exchangeId = String(item.exchange_id ?? '');
        if (!isExchangeOrganizer(state, exchangeId, uid)) {
          throw new LocalDebugError(
            'Only the exchange organizer can insert participants directly.',
            403,
          );
        }
        if (!isExchangeOpen(state, exchangeId)) {
          throw new LocalDebugError('Exchange is no longer open for sign-ups.', 403);
        }
        if (state.participants.some((p) => p.exchange_id === exchangeId && p.user_id === uid)) {
          throw new LocalDebugError('You have already joined this exchange.', 409);
        }
        const targetExchange = state.exchanges.find((ex) => ex.id === exchangeId);
        if (targetExchange && typeof targetExchange.target_participants === 'number') {
          const currentCount = state.participants.filter(
            (p) => p.exchange_id === exchangeId,
          ).length;
          if (currentCount >= targetExchange.target_participants) {
            throw new LocalDebugError(
              `This exchange is full (${targetExchange.target_participants}/${targetExchange.target_participants} participants joined).`,
              409,
            );
          }
        }
        const accountUser = state.users.find((u) => u.id === uid);
        const accountName = (accountUser?.name ?? '').trim();
        const displayName = accountName || String(item.display_name ?? '').trim();
        if (!displayName) {
          throw new LocalDebugError('Display name cannot be empty.', 400);
        }
        let cleanAlias = String(item.alias ?? '').trim().slice(0, 40);
        if (cleanAlias.toLowerCase() === displayName.toLowerCase()) {
          cleanAlias = '';
        }
        const wishlistItems = Array.isArray(item.wishlist_items)
          ? (item.wishlist_items as WishlistItem[])
          : [];
        const row: Participant = {
          id: generateUuid(),
          exchange_id: exchangeId,
          user_id: uid,
          display_name: displayName,
          alias: cleanAlias,
          wishlist_items: wishlistItems,
          dislikes: String(item.dislikes ?? ''),
          delivery_notes: String(item.delivery_notes ?? ''),
          joined_at: nowIso,
        };
        state.participants.push(row);
        createdRows.push(row);
      }
      break;
    }

    case 'exclusions': {
      for (const item of items) {
        const exchangeId = String(item.exchange_id ?? '');
        const giverParticipantId = String(item.giver_participant_id ?? '');
        const excludedParticipantId = String(item.excluded_participant_id ?? '');

        if (!isExchangeOrganizer(state, exchangeId, uid)) {
          throw new LocalDebugError('Only the organizer can manage exclusions.', 403);
        }
        if (!isExchangeOpen(state, exchangeId)) {
          throw new LocalDebugError('Cannot modify exclusions after names are drawn.', 403);
        }
        if (giverParticipantId === excludedParticipantId) {
          throw new LocalDebugError('A participant cannot be excluded from themselves.', 400);
        }
        const giverExists = state.participants.some(
          (p) => p.id === giverParticipantId && p.exchange_id === exchangeId,
        );
        const excludedExists = state.participants.some(
          (p) => p.id === excludedParticipantId && p.exchange_id === exchangeId,
        );
        if (!giverExists || !excludedExists) {
          throw new LocalDebugError('Selected participants do not belong to this exchange.', 400);
        }
        const duplicate = state.exclusions.some(
          (rule) =>
            rule.exchange_id === exchangeId &&
            rule.giver_participant_id === giverParticipantId &&
            rule.excluded_participant_id === excludedParticipantId,
        );
        if (duplicate) {
          throw new LocalDebugError('That exclusion rule already exists.', 409);
        }

        const row: Exclusion = {
          id: generateUuid(),
          exchange_id: exchangeId,
          giver_participant_id: giverParticipantId,
          excluded_participant_id: excludedParticipantId,
          created_at: nowIso,
        };
        state.exclusions.push(row);
        createdRows.push(row);
      }
      break;
    }

    case 'anonymous_messages': {
      for (const item of items) {
        const exchangeId = String(item.exchange_id ?? '');
        const assignmentId = String(item.assignment_id ?? '');
        const senderRole = String(item.sender_role ?? '') as AnonymousSenderRole;
        const body = String(item.body ?? '').trim();

        if (!body || body.length > 1000) {
          throw new LocalDebugError('Message must be between 1 and 1000 characters.', 400);
        }
        const assignment = state.assignments.find(
          (a) => a.id === assignmentId && a.exchange_id === exchangeId,
        );
        if (!assignment) {
          throw new LocalDebugError('Assignment thread not found.', 403);
        }
        const allowed =
          (senderRole === 'santa' && assignment.giver_id === uid) ||
          (senderRole === 'recipient' && assignment.recipient_id === uid);
        if (!allowed) {
          throw new LocalDebugError('You do not have permission to post to this thread.', 403);
        }

        const senderParticipant = state.participants.find(
          (p) => p.exchange_id === exchangeId && p.user_id === uid,
        );
        const senderUser = state.users.find((u) => u.id === uid);
        const leakCheck = detectIdentityLeak(body, {
          displayName: senderParticipant?.display_name ?? senderUser?.name,
          alias: senderParticipant?.alias,
          email: senderUser?.email,
          accountName: senderUser?.name,
        });
        if (leakCheck.blocked) {
          throw new LocalDebugError(
            leakCheck.reason ?? 'Identity reveal blocked: please keep your message anonymous.',
            422,
          );
        }

        const row: AnonymousMessage = {
          id: generateUuid(),
          exchange_id: exchangeId,
          assignment_id: assignmentId,
          sender_role: senderRole,
          body,
          created_at: nowIso,
        };
        state.anonymous_messages.push(row);
        createdRows.push(row);
      }
      break;
    }

    default:
      throw new LocalDebugError(`Insert not permitted on table: ${table}`, 403);
  }

  saveState(state);
  return clone(createdRows) as T[];
}

export async function debugUpdate<T>(
  table: string,
  eq: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const state = loadState();
  const uid = requireCurrentUser(state);
  const updatedRows: object[] = [];

  const matchesEq = (row: object): boolean =>
    Object.entries(eq).every(
      ([col, val]) => String((row as Record<string, unknown>)[col] ?? '') === val,
    );

  switch (table) {
    case 'exchanges': {
      for (const ex of state.exchanges) {
        if (ex.organizer_id === uid && matchesEq(ex)) {
          if (payload.title !== undefined) ex.title = String(payload.title);
          if (payload.description !== undefined) ex.description = String(payload.description);
          if (payload.budget_amount !== undefined) {
            ex.budget_amount =
              payload.budget_amount === null ? null : Number(payload.budget_amount);
          }
          if (payload.currency !== undefined) ex.currency = String(payload.currency);
          if (payload.exchange_date !== undefined) {
            ex.exchange_date = payload.exchange_date ? String(payload.exchange_date) : null;
          }
          if (payload.target_participants !== undefined) {
            const parsedTarget = parseTargetParticipants(payload.target_participants);
            if (parsedTarget !== null) {
              const currentCount = state.participants.filter(
                (p) => p.exchange_id === ex.id,
              ).length;
              if (parsedTarget < currentCount) {
                throw new LocalDebugError(
                  `Participant limit (${parsedTarget}) cannot be lower than the ${currentCount} participants already joined.`,
                  400,
                );
              }
            }
            ex.target_participants = parsedTarget;
          }
          updatedRows.push(ex);
        }
      }
      break;
    }

    case 'participants': {
      for (const participant of state.participants) {
        if (participant.user_id === uid && matchesEq(participant)) {
          if (!isExchangeActive(state, participant.exchange_id)) {
            throw new LocalDebugError('Wishlists are locked once an exchange is completed.', 403);
          }
          if (payload.alias !== undefined) {
            let cleanAlias = String(payload.alias).trim().slice(0, 40);
            if (cleanAlias.toLowerCase() === participant.display_name.toLowerCase()) {
              cleanAlias = '';
            }
            participant.alias = cleanAlias;
          }
          if (Array.isArray(payload.wishlist_items)) {
            participant.wishlist_items = payload.wishlist_items as WishlistItem[];
          }
          if (payload.dislikes !== undefined) {
            participant.dislikes = String(payload.dislikes);
          }
          if (payload.delivery_notes !== undefined) {
            participant.delivery_notes = String(payload.delivery_notes);
          }
          updatedRows.push(participant);
        }
      }
      break;
    }

    case 'assignments': {
      for (const assignment of state.assignments) {
        if (assignment.giver_id === uid && matchesEq(assignment)) {
          if (payload.revealed_at !== undefined) {
            assignment.revealed_at = payload.revealed_at ? String(payload.revealed_at) : null;
          }
          updatedRows.push(assignment);
        }
      }
      break;
    }

    default:
      throw new LocalDebugError(`Update not permitted on table: ${table}`, 403);
  }

  saveState(state);
  return clone(updatedRows) as T[];
}

export async function debugRemove(table: string, eq: Record<string, string>): Promise<void> {
  const state = loadState();
  const uid = requireCurrentUser(state);

  const matchesEq = (row: object): boolean =>
    Object.entries(eq).every(
      ([col, val]) => String((row as Record<string, unknown>)[col] ?? '') === val,
    );

  switch (table) {
    case 'exclusions': {
      state.exclusions = state.exclusions.filter((rule) => {
        if (!matchesEq(rule)) return true;
        if (!isExchangeOrganizer(state, rule.exchange_id, uid) || !isExchangeOpen(state, rule.exchange_id)) {
          return true;
        }
        return false;
      });
      break;
    }

    case 'participants': {
      const removedIds = new Set<string>();
      state.participants = state.participants.filter((participant) => {
        if (!matchesEq(participant)) return true;
        const canDelete =
          (participant.user_id === uid ||
            isExchangeOrganizer(state, participant.exchange_id, uid)) &&
          isExchangeOpen(state, participant.exchange_id);
        if (canDelete) {
          removedIds.add(participant.id);
          return false;
        }
        return true;
      });
      if (removedIds.size > 0) {
        state.exclusions = state.exclusions.filter(
          (rule) =>
            !removedIds.has(rule.giver_participant_id) &&
            !removedIds.has(rule.excluded_participant_id),
        );
      }
      break;
    }

    case 'exchanges': {
      const removedExchangeIds = new Set<string>();
      state.exchanges = state.exchanges.filter((ex) => {
        if (!matchesEq(ex)) return true;
        if (ex.organizer_id === uid && ex.status === 'open') {
          removedExchangeIds.add(ex.id);
          return false;
        }
        return true;
      });
      if (removedExchangeIds.size > 0) {
        state.participants = state.participants.filter(
          (p) => !removedExchangeIds.has(p.exchange_id),
        );
        state.exclusions = state.exclusions.filter(
          (e) => !removedExchangeIds.has(e.exchange_id),
        );
        state.assignments = state.assignments.filter(
          (a) => !removedExchangeIds.has(a.exchange_id),
        );
        state.anonymous_messages = state.anonymous_messages.filter(
          (m) => !removedExchangeIds.has(m.exchange_id),
        );
      }
      break;
    }

    default:
      throw new LocalDebugError(`Delete not permitted on table: ${table}`, 403);
  }

  saveState(state);
}

export async function debugFetchInvitePreview(code: string): Promise<InvitePreview> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    throw new LocalDebugError('Invite not found.', 404);
  }

  const state = loadState();
  const exchange = state.exchanges.find((ex) => ex.invite_code.toUpperCase() === normalized);
  if (!exchange) {
    throw new LocalDebugError('Invite code not found.', 404);
  }

  const participantCount = state.participants.filter(
    (p) => p.exchange_id === exchange.id,
  ).length;

  return {
    exchange_id: exchange.id,
    title: exchange.title,
    description: exchange.description,
    budget_amount: exchange.budget_amount,
    currency: exchange.currency,
    exchange_date: exchange.exchange_date,
    status: exchange.status,
    participant_count: participantCount,
    target_participants: exchange.target_participants ?? null,
  };
}

export async function debugJoinExchangeByCode(
  code: string,
  payload: LocalJoinPayload,
): Promise<JoinExchangeResponse> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    throw new LocalDebugError('Invite code not found.', 404);
  }

  const state = loadState();
  const uid = requireCurrentUser(state);

  const exchange = state.exchanges.find((ex) => ex.invite_code.toUpperCase() === normalized);
  if (!exchange) {
    throw new LocalDebugError('Invite code not found.', 404);
  }

  const existing = state.participants.find(
    (p) => p.exchange_id === exchange.id && p.user_id === uid,
  );
  if (existing) {
    return {
      exchange_id: exchange.id,
      participant_id: existing.id,
      already_joined: true,
    };
  }

  if (exchange.status !== 'open') {
    throw new LocalDebugError(
      'This exchange has already drawn names and is closed to new participants.',
      409,
    );
  }

  if (typeof exchange.target_participants === 'number') {
    const currentCount = state.participants.filter(
      (p) => p.exchange_id === exchange.id,
    ).length;
    if (currentCount >= exchange.target_participants) {
      throw new LocalDebugError(
        `This exchange is full (${exchange.target_participants}/${exchange.target_participants} participants joined).`,
        409,
      );
    }
  }

  const accountUser = state.users.find((u) => u.id === uid);
  const accountName = (accountUser?.name ?? '').trim();
  const displayName = accountName || payload.display_name.trim();
  if (!displayName) {
    throw new LocalDebugError('Display name cannot be empty.', 422);
  }

  let cleanAlias = (payload.alias ?? '').trim().slice(0, 40);
  if (cleanAlias.toLowerCase() === displayName.toLowerCase()) {
    cleanAlias = '';
  }

  const cleanedItems: WishlistItem[] = [];
  for (const item of payload.wishlist_items) {
    const title = item.title.trim();
    if (!title) {
      throw new LocalDebugError('Wishlist item title cannot be empty.', 422);
    }
    let safeUrl: string | null = null;
    if (item.url) {
      try {
        safeUrl = validateExternalUrl(item.url);
      } catch (err) {
        throw new LocalDebugError(
          err instanceof Error ? err.message : 'Item links must begin with http:// or https://.',
          422,
        );
      }
    }
    cleanedItems.push({
      title,
      url: safeUrl,
      notes: (item.notes ?? '').trim(),
    });
  }

  const created: Participant = {
    id: generateUuid(),
    exchange_id: exchange.id,
    user_id: uid,
    display_name: displayName,
    alias: cleanAlias,
    wishlist_items: cleanedItems,
    dislikes: payload.dislikes.trim(),
    delivery_notes: payload.delivery_notes.trim(),
    joined_at: new Date().toISOString(),
  };

  state.participants.push(created);
  saveState(state);

  return {
    exchange_id: exchange.id,
    participant_id: created.id,
    already_joined: false,
  };
}

export async function debugTriggerDraw(exchangeId: string): Promise<DrawResponse> {
  const state = loadState();
  const uid = requireCurrentUser(state);

  const exchange = state.exchanges.find((ex) => ex.id === exchangeId);
  if (!exchange) {
    throw new LocalDebugError('Exchange not found.', 404);
  }
  if (exchange.organizer_id !== uid) {
    throw new LocalDebugError('Only the exchange organizer can draw names.', 403);
  }
  if (exchange.status !== 'open') {
    throw new LocalDebugError('Names have already been drawn for this exchange.', 409);
  }

  const participants = state.participants
    .filter((p) => p.exchange_id === exchangeId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

  if (typeof exchange.target_participants === 'number') {
    if (participants.length < exchange.target_participants) {
      throw new LocalDebugError(
        `Waiting for all participants before drawing (${participants.length} of ${exchange.target_participants} joined). Update or remove the participant limit if your group size changed.`,
        422,
      );
    }
    if (participants.length > exchange.target_participants) {
      throw new LocalDebugError(
        `Participant count (${participants.length}) exceeds the limit (${exchange.target_participants}). Update the participant limit before drawing.`,
        422,
      );
    }
  }
  const participantToUser = new Map(participants.map((p) => [p.id, p.user_id]));
  const userIds = participants.map((p) => p.user_id);

  const blockedPairs = new Set<string>();
  for (const rule of state.exclusions) {
    if (rule.exchange_id !== exchangeId) continue;
    const giverUid = participantToUser.get(rule.giver_participant_id);
    const excludedUid = participantToUser.get(rule.excluded_participant_id);
    if (giverUid && excludedUid) {
      blockedPairs.add(`${giverUid}::${excludedUid}`);
    }
  }

  const pairs = generateAssignments(userIds, blockedPairs);
  const nowIso = new Date().toISOString();

  for (const [giverId, recipientId] of pairs.entries()) {
    state.assignments.push({
      id: generateUuid(),
      exchange_id: exchangeId,
      giver_id: giverId,
      recipient_id: recipientId,
      revealed_at: null,
      created_at: nowIso,
    });
  }

  exchange.status = 'drawn';
  exchange.drawn_at = nowIso;
  saveState(state);

  return {
    exchange_id: exchangeId,
    status: 'drawn',
    participant_count: userIds.length,
    drawn_at: nowIso,
  };
}

export async function debugResetDraw(exchangeId: string): Promise<ResetDrawResponse> {
  const state = loadState();
  const uid = requireCurrentUser(state);

  const exchange = state.exchanges.find((ex) => ex.id === exchangeId);
  if (!exchange) {
    throw new LocalDebugError('Exchange not found.', 404);
  }
  if (exchange.organizer_id !== uid) {
    throw new LocalDebugError('Only the exchange organizer can reset the draw.', 403);
  }

  state.anonymous_messages = state.anonymous_messages.filter(
    (msg) => msg.exchange_id !== exchangeId,
  );
  state.assignments = state.assignments.filter((asgn) => asgn.exchange_id !== exchangeId);
  exchange.status = 'open';
  exchange.drawn_at = null;
  saveState(state);

  return {
    exchange_id: exchangeId,
    status: 'open',
  };
}
