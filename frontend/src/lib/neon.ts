import type { UserProfile } from '../types/database';
import {
  LocalDebugError,
  debugGetJwt,
  debugGetSession,
  debugInsert,
  debugRemove,
  debugRequestPasswordResetOtp,
  debugResetPasswordWithOtp,
  debugSelect,
  debugSelectSingle,
  debugSendEmailVerificationOtp,
  debugSignInWithEmail,
  debugSignInWithGoogle,
  debugSignOut,
  debugSignUpWithEmail,
  debugUpdate,
  debugVerifyEmailWithOtp,
} from './localDebugStore';
import { sanitizeRedirectPath, validateExternalUrl } from './validation';

const rawAuthUrl = (import.meta.env.VITE_NEON_AUTH_URL as string | undefined)?.trim() ?? '';
const rawDataApiUrl = (import.meta.env.VITE_NEON_DATA_API_URL as string | undefined)?.trim() ?? '';

export const isLocalDebugMode = __LOCAL_DEBUG__;
export const NEON_AUTH_URL = rawAuthUrl.replace(/\/+$/, '');
export const NEON_DATA_API_URL = rawDataApiUrl.replace(/\/+$/, '');
export const isNeonConfigured = isLocalDebugMode || Boolean(NEON_AUTH_URL && NEON_DATA_API_URL);

const SESSION_VERIFIER_PARAM = 'neon_auth_session_verifier';

let cachedJwt: string | null = null;
let cachedJwtExpMs: number | null = null;
let pendingVerifierExchange: Promise<UserProfile | null> | null = null;

function isJwtString(value: unknown): value is string {
  return typeof value === 'string' && value.split('.').length === 3 && value.length > 20;
}

function extractJwtExpMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function setCachedJwt(token: string | null): void {
  if (!token) {
    cachedJwt = null;
    cachedJwtExpMs = null;
    return;
  }
  cachedJwt = token;
  cachedJwtExpMs = extractJwtExpMs(token);
}

function captureJwtFromResponse(response: Response, bodyToken?: unknown): string | null {
  const headerToken = response.headers.get('set-auth-jwt');
  if (isJwtString(headerToken)) {
    setCachedJwt(headerToken);
    return headerToken;
  }
  if (isJwtString(bodyToken)) {
    setCachedJwt(bodyToken);
    return bodyToken;
  }
  return null;
}

export class AuthApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

async function runDebugAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LocalDebugError) {
      throw new AuthApiError(err.message, err.status, err.code);
    }
    throw err;
  }
}

interface BetterAuthUser {
  id?: string;
  email?: string;
  name?: string | null;
  emailVerified?: boolean;
}

interface BetterAuthResponsePayload {
  user?: BetterAuthUser;
  session?: { token?: string };
  token?: string;
  url?: string;
  code?: string;
  message?: string;
  error?: string | { message?: string };
}

function extractAuthError(payload: BetterAuthResponsePayload | null, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === 'object' &&
    typeof payload.error.message === 'string' &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function assertAuthConfigured(): string {
  if (!NEON_AUTH_URL) {
    throw new Error('Neon Auth is not configured. Set VITE_NEON_AUTH_URL in frontend/.env.');
  }
  return NEON_AUTH_URL;
}

function consumeSessionVerifierFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const url = new URL(window.location.href);
  const verifier = url.searchParams.get(SESSION_VERIFIER_PARAM)?.trim() || null;
  if (!verifier) {
    return null;
  }
  url.searchParams.delete(SESSION_VERIFIER_PARAM);
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', cleanUrl);
  return verifier;
}

async function fetchCurrentSession(authUrl: string): Promise<UserProfile | null> {
  const response = await fetch(`${authUrl}/get-session`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    return null;
  }
  const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
  captureJwtFromResponse(response, payload?.session?.token ?? payload?.token);
  const user = payload?.user;
  if (!user?.id || !user.email) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    emailVerified: Boolean(user.emailVerified),
  };
}

export const neonAuth = {
  async getSession(): Promise<UserProfile | null> {
    if (__LOCAL_DEBUG__) {
      return debugGetSession();
    }
    if (!NEON_AUTH_URL) {
      return null;
    }
    if (pendingVerifierExchange) {
      return pendingVerifierExchange;
    }

    const verifier = consumeSessionVerifierFromUrl();
    if (verifier) {
      setCachedJwt(null);
      pendingVerifierExchange = (async () => {
        try {
          const response = await fetch(
            `${NEON_AUTH_URL}/get-session?${SESSION_VERIFIER_PARAM}=${encodeURIComponent(verifier)}`,
            {
              method: 'GET',
              credentials: 'include',
            },
          );
          const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
          if (response.ok) {
            captureJwtFromResponse(response, payload?.session?.token ?? payload?.token);
            const user = payload?.user;
            if (user?.id && user.email) {
              return {
                id: user.id,
                email: user.email,
                name: user.name ?? null,
                emailVerified: Boolean(user.emailVerified),
              };
            }
          }

          const fallbackUser = await fetchCurrentSession(NEON_AUTH_URL);
          if (fallbackUser) {
            return fallbackUser;
          }

          const code = typeof payload?.code === 'string' ? payload.code : '';
          const detail = extractAuthError(payload, 'Unable to complete sign-in verification.');
          if (
            code === 'SESSION_CHALLENGE_COOKIE_NOT_FOUND' ||
            detail.toLowerCase().includes('challenge cookie')
          ) {
            throw new Error(
              'Google sign-in could not verify your browser session cookie. Allow third-party cookies for this site (or disable strict shields for localhost) and try again, or sign in with email and password.',
            );
          }
          throw new Error(`Sign-in verification failed: ${detail}. Please try signing in again.`);
        } finally {
          pendingVerifierExchange = null;
        }
      })();
      return pendingVerifierExchange;
    }

    return fetchCurrentSession(NEON_AUTH_URL);
  },

  async getJwt(forceRefresh = false): Promise<string | null> {
    if (__LOCAL_DEBUG__) {
      return debugGetJwt();
    }
    if (!NEON_AUTH_URL) {
      return null;
    }
    if (pendingVerifierExchange) {
      await pendingVerifierExchange.catch(() => null);
    }
    if (
      !forceRefresh &&
      cachedJwt &&
      (cachedJwtExpMs === null || cachedJwtExpMs - Date.now() > 30_000)
    ) {
      return cachedJwt;
    }

    if (forceRefresh) {
      setCachedJwt(null);
    }

    try {
      const tokenRes = await fetch(`${NEON_AUTH_URL}/token`, {
        method: 'GET',
        credentials: 'include',
      });
      if (tokenRes.ok) {
        const tokenPayload = await parseJsonSafely<BetterAuthResponsePayload>(tokenRes);
        const captured = captureJwtFromResponse(tokenRes, tokenPayload?.token);
        if (captured) {
          return captured;
        }
      }
    } catch {
      // Fall through to get-session header fallback
    }

    const sessionRes = await fetch(`${NEON_AUTH_URL}/get-session`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!sessionRes.ok) {
      setCachedJwt(null);
      return null;
    }
    const sessionPayload = await parseJsonSafely<BetterAuthResponsePayload>(sessionRes);
    const captured = captureJwtFromResponse(
      sessionRes,
      sessionPayload?.token ?? sessionPayload?.session?.token,
    );
    return captured;
  },

  async signUpWithEmail(
    name: string,
    email: string,
    password: string,
  ): Promise<{ user: UserProfile; requiresEmailVerification: boolean }> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugSignUpWithEmail(name, email, password));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/sign-up/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Unable to create your account.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    setCachedJwt(null);
    const token = captureJwtFromResponse(response, payload?.token ?? payload?.session?.token);
    if (!payload?.user?.id || !payload.user.email) {
      throw new Error('Account created, but session details were missing.');
    }
    const emailVerified = Boolean(payload.user.emailVerified);
    const requiresEmailVerification = !emailVerified && !token;
    return {
      user: {
        id: payload.user.id,
        email: payload.user.email,
        name: payload.user.name ?? name,
        emailVerified,
      },
      requiresEmailVerification,
    };
  },

  async signInWithEmail(email: string, password: string): Promise<UserProfile> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugSignInWithEmail(email, password));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/sign-in/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Invalid email or password.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    setCachedJwt(null);
    captureJwtFromResponse(response, payload?.token ?? payload?.session?.token);
    if (!payload?.user?.id || !payload.user.email) {
      throw new Error('Signed in, but session details were missing.');
    }
    return {
      id: payload.user.id,
      email: payload.user.email,
      name: payload.user.name ?? null,
      emailVerified: Boolean(payload.user.emailVerified),
    };
  },

  async sendEmailVerificationOtp(email: string): Promise<{ debugOtp?: string }> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugSendEmailVerificationOtp(email));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/email-otp/send-verification-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        type: 'email-verification',
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Could not send verification code.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    return {};
  },

  async verifyEmailWithOtp(email: string, otp: string): Promise<UserProfile> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugVerifyEmailWithOtp(email, otp));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/email-otp/verify-email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Invalid or expired verification code.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    setCachedJwt(null);
    captureJwtFromResponse(response, payload?.token ?? payload?.session?.token);
    const sessionUser = await fetchCurrentSession(authUrl);
    if (sessionUser) {
      return sessionUser;
    }
    if (!payload?.user?.id || !payload.user.email) {
      throw new Error('Email verified, but session details were missing.');
    }
    return {
      id: payload.user.id,
      email: payload.user.email,
      name: payload.user.name ?? null,
      emailVerified: Boolean(payload.user.emailVerified ?? true),
    };
  },

  async requestPasswordResetOtp(email: string): Promise<{ debugOtp?: string }> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugRequestPasswordResetOtp(email));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/email-otp/request-password-reset`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Could not send password reset code.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    return {};
  },

  async resetPasswordWithOtp(email: string, otp: string, newPassword: string): Promise<void> {
    if (__LOCAL_DEBUG__) {
      return runDebugAuth(() => debugResetPasswordWithOtp(email, otp, newPassword));
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/email-otp/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        password: newPassword,
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Invalid or expired reset code.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    setCachedJwt(null);
  },

  async resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
    if (__LOCAL_DEBUG__) {
      throw new AuthApiError('Token password reset links are not used in local debug mode.', 400);
    }
    const authUrl = assertAuthConfigured();
    const response = await fetch(`${authUrl}/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.trim(),
        newPassword,
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok) {
      throw new AuthApiError(
        extractAuthError(payload, 'Reset link is invalid or expired.'),
        response.status,
        typeof payload?.code === 'string' ? payload.code : undefined,
      );
    }
    setCachedJwt(null);
  },

  async signInWithGoogle(redirectPath: string): Promise<void> {
    if (__LOCAL_DEBUG__) {
      return debugSignInWithGoogle(redirectPath);
    }
    const authUrl = assertAuthConfigured();
    const safePath = sanitizeRedirectPath(redirectPath);
    const callbackURL = `${window.location.origin}${safePath}`;
    const response = await fetch(`${authUrl}/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        callbackURL,
        disableRedirect: true,
      }),
    });
    const payload = await parseJsonSafely<BetterAuthResponsePayload>(response);
    if (!response.ok || !payload?.url) {
      throw new Error(extractAuthError(payload, 'Unable to start Google sign-in.'));
    }
    const safeOAuthUrl = validateExternalUrl(payload.url);
    if (!safeOAuthUrl) {
      throw new Error('Invalid OAuth redirect URL returned by Neon Auth.');
    }
    window.location.assign(safeOAuthUrl);
  },

  async signOut(): Promise<void> {
    setCachedJwt(null);
    if (__LOCAL_DEBUG__) {
      return debugSignOut();
    }
    if (!NEON_AUTH_URL) {
      return;
    }
    await fetch(`${NEON_AUTH_URL}/sign-out`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  },
};

export class DataApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DataApiError';
    this.status = status;
  }
}

interface PostgrestErrorPayload {
  message?: string;
  details?: string;
  hint?: string;
}

async function dataApiRequest<T>(
  table: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    params?: URLSearchParams;
    body?: unknown;
    preferReturn?: boolean;
  },
): Promise<T> {
  if (!NEON_DATA_API_URL) {
    throw new DataApiError(
      'Neon Data API is not configured. Set VITE_NEON_DATA_API_URL in frontend/.env.',
      503,
    );
  }

  const executeWithToken = async (jwt: string): Promise<Response> => {
    const querySuffix = options.params && options.params.toString() ? `?${options.params.toString()}` : '';
    const url = `${NEON_DATA_API_URL}/${encodeURIComponent(table)}${querySuffix}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.preferReturn) {
      headers.Prefer = 'return=representation';
    }
    return fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let jwt = await neonAuth.getJwt(false);
  if (!jwt) {
    throw new DataApiError('Please sign in to continue.', 401);
  }

  let response = await executeWithToken(jwt);
  if (response.status === 401) {
    const refreshed = await neonAuth.getJwt(true);
    if (refreshed) {
      jwt = refreshed;
      response = await executeWithToken(jwt);
    }
  }

  if (!response.ok) {
    const errPayload = await parseJsonSafely<PostgrestErrorPayload>(response);
    const message =
      errPayload?.message || errPayload?.details || `Database request failed (${response.status}).`;
    throw new DataApiError(message, response.status);
  }

  if (response.status === 204 || options.method === 'DELETE') {
    return undefined as T;
  }

  const data = await parseJsonSafely<T>(response);
  return (data ?? ([] as unknown)) as T;
}

export interface SelectQuery {
  select?: string;
  eq?: Record<string, string>;
  order?: string;
  limit?: number;
}

const TABLE_DEFAULT_SELECT: Record<string, string> = {
  exchanges:
    'id,title,description,budget_amount,currency,exchange_date,target_participants,invite_code,organizer_id,status,drawn_at,created_at',
  participants:
    'id,exchange_id,user_id,display_name,alias,wishlist_items,dislikes,delivery_notes,joined_at',
  exclusions:
    'id,exchange_id,giver_participant_id,excluded_participant_id,created_at',
  assignments:
    'id,exchange_id,giver_id,recipient_id,revealed_at,created_at',
  anonymous_messages:
    'id,exchange_id,assignment_id,sender_role,body,created_at',
};

function buildFilterParams(table: string, query?: SelectQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('select', query?.select || TABLE_DEFAULT_SELECT[table] || '*');
  if (query?.eq) {
    for (const [col, val] of Object.entries(query.eq)) {
      params.set(col, `eq.${val}`);
    }
  }
  if (query?.order) {
    params.set('order', query.order);
  }
  if (query?.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  return params;
}

async function runDebugDataApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LocalDebugError) {
      throw new DataApiError(err.message, err.status);
    }
    throw err;
  }
}

export const neonDataApi = {
  select<T>(table: string, query?: SelectQuery): Promise<T[]> {
    if (__LOCAL_DEBUG__) {
      return runDebugDataApi(() => debugSelect<T>(table, query));
    }
    return dataApiRequest<T[]>(table, {
      method: 'GET',
      params: buildFilterParams(table, query),
    });
  },

  async selectSingle<T>(
    table: string,
    query: { select?: string; eq: Record<string, string> },
  ): Promise<T | null> {
    if (__LOCAL_DEBUG__) {
      return runDebugDataApi(() => debugSelectSingle<T>(table, query));
    }
    const rows = await dataApiRequest<T[]>(table, {
      method: 'GET',
      params: buildFilterParams(table, { ...query, limit: 1 }),
    });
    return rows[0] ?? null;
  },

  insert<T>(
    table: string,
    payload: Record<string, unknown> | Array<Record<string, unknown>>,
  ): Promise<T[]> {
    if (__LOCAL_DEBUG__) {
      return runDebugDataApi(() => debugInsert<T>(table, payload));
    }
    const defaultSelect = TABLE_DEFAULT_SELECT[table];
    const params = defaultSelect ? new URLSearchParams({ select: defaultSelect }) : undefined;
    return dataApiRequest<T[]>(table, {
      method: 'POST',
      params,
      body: payload,
      preferReturn: true,
    });
  },

  update<T>(
    table: string,
    eq: Record<string, string>,
    payload: Record<string, unknown>,
  ): Promise<T[]> {
    if (__LOCAL_DEBUG__) {
      return runDebugDataApi(() => debugUpdate<T>(table, eq, payload));
    }
    const params = new URLSearchParams();
    const defaultSelect = TABLE_DEFAULT_SELECT[table];
    if (defaultSelect) {
      params.set('select', defaultSelect);
    }
    for (const [col, val] of Object.entries(eq)) {
      params.set(col, `eq.${val}`);
    }
    return dataApiRequest<T[]>(table, {
      method: 'PATCH',
      params,
      body: payload,
      preferReturn: true,
    });
  },

  remove(table: string, eq: Record<string, string>): Promise<void> {
    if (__LOCAL_DEBUG__) {
      return runDebugDataApi(() => debugRemove(table, eq));
    }
    const params = new URLSearchParams();
    for (const [col, val] of Object.entries(eq)) {
      params.set(col, `eq.${val}`);
    }
    return dataApiRequest<void>(table, {
      method: 'DELETE',
      params,
    });
  },
};
