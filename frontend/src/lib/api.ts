import type {
  AnonymousMessage,
  AnonymousSenderRole,
  DrawResponse,
  InvitePreview,
  JoinExchangeResponse,
  ResetDrawResponse,
  WishlistItem,
} from '../types/database';
import {
  LocalDebugError,
  debugFetchInvitePreview,
  debugInsert,
  debugJoinExchangeByCode,
  debugResetDraw,
  debugTriggerDraw,
} from './localDebugStore';

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function resolveApiBaseUrl(): string {
  const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const configured = rawApiUrl ? rawApiUrl.replace(/\/+$/, '') : '';

  if (typeof window !== 'undefined') {
    const onLoopback = isLoopbackHost(window.location.hostname);
    if (!configured) {
      return '';
    }
    if (configured.startsWith('/')) {
      return configured;
    }
    try {
      const parsed = new URL(configured);
      if (isLoopbackHost(parsed.hostname)) {
        // Route /api/* through Vite's server.proxy / preview.proxy on same-origin loopback
        if (!onLoopback || parsed.origin !== window.location.origin) {
          return '';
        }
      }
    } catch {
      return '';
    }
    return configured;
  }

  return configured || 'http://localhost:8000';
}

export const API_BASE_URL = resolveApiBaseUrl();

export interface JoinExchangePayload {
  display_name: string;
  alias?: string;
  wishlist_items: WishlistItem[];
  dislikes: string;
  delivery_notes: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function withFreshTokenRetry<T>(
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>,
  operation: (token: string) => Promise<T>,
): Promise<T> {
  const token = await getAccessToken(false);
  if (!token) {
    throw new Error('Your session expired. Please sign in again.');
  }
  try {
    return await operation(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await getAccessToken(true);
      if (refreshed) {
        return await operation(refreshed);
      }
      throw new Error('Your session expired. Please sign in again.');
    }
    throw err;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };
    if (typeof body.detail === 'string') {
      return body.detail;
    }
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const messages = body.detail
        .map((entry) => entry.msg)
        .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }
  } catch {
    // Non-JSON response fallback
  }
  return `Request failed with status ${response.status}.`;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }
  return (await response.json()) as T;
}

async function runDebugApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LocalDebugError) {
      throw new ApiError(err.message, err.status);
    }
    throw err;
  }
}

export function fetchInvitePreview(code: string): Promise<InvitePreview> {
  if (__LOCAL_DEBUG__) {
    return runDebugApi(() => debugFetchInvitePreview(code));
  }
  const cleaned = encodeURIComponent(code.trim());
  return requestJson<InvitePreview>(`/api/invites/${cleaned}`, {
    method: 'GET',
  });
}

export function joinExchangeByCode(
  code: string,
  payload: JoinExchangePayload,
  accessToken: string,
): Promise<JoinExchangeResponse> {
  if (__LOCAL_DEBUG__) {
    return runDebugApi(() => debugJoinExchangeByCode(code, payload));
  }
  const cleaned = encodeURIComponent(code.trim());
  return requestJson<JoinExchangeResponse>(`/api/invites/${cleaned}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export function triggerDraw(exchangeId: string, accessToken: string): Promise<DrawResponse> {
  if (__LOCAL_DEBUG__) {
    return runDebugApi(() => debugTriggerDraw(exchangeId));
  }
  const cleaned = encodeURIComponent(exchangeId);
  return requestJson<DrawResponse>(`/api/exchanges/${cleaned}/draw`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function resetDraw(exchangeId: string, accessToken: string): Promise<ResetDrawResponse> {
  if (__LOCAL_DEBUG__) {
    return runDebugApi(() => debugResetDraw(exchangeId));
  }
  const cleaned = encodeURIComponent(exchangeId);
  return requestJson<ResetDrawResponse>(`/api/exchanges/${cleaned}/reset-draw`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export interface SendQaMessagePayload {
  assignment_id: string;
  sender_role: AnonymousSenderRole;
  body: string;
}

export async function sendQaMessage(
  exchangeId: string,
  payload: SendQaMessagePayload,
  accessToken: string,
): Promise<AnonymousMessage> {
  if (__LOCAL_DEBUG__) {
    return runDebugApi(async () => {
      const inserted = await debugInsert<AnonymousMessage>('anonymous_messages', {
        exchange_id: exchangeId,
        assignment_id: payload.assignment_id,
        sender_role: payload.sender_role,
        body: payload.body.trim(),
      });
      if (!inserted[0]) {
        throw new LocalDebugError('Unable to save message.', 500);
      }
      return inserted[0];
    });
  }
  const cleaned = encodeURIComponent(exchangeId);
  return requestJson<AnonymousMessage>(`/api/exchanges/${cleaned}/qa/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export interface QaStreamHandlers {
  onConnected?: () => void;
  onMessage?: (message: AnonymousMessage) => void;
  onSyncRequired?: () => void;
  onExchangeReset?: () => void;
}

export async function subscribeQaStream(
  exchangeId: string,
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>,
  handlers: QaStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const cleaned = encodeURIComponent(exchangeId);
  const openStream = async (token: string): Promise<Response> =>
    fetch(`${API_BASE_URL}/api/exchanges/${cleaned}/qa-stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal,
    });

  let token = await getAccessToken(false);
  if (!token) {
    throw new ApiError('Your session expired. Please sign in again.', 401);
  }

  let response = await openStream(token);
  if (response.status === 401) {
    const refreshed = await getAccessToken(true);
    if (refreshed) {
      token = refreshed;
      response = await openStream(token);
    }
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  if (!response.body) {
    throw new Error('Live stream unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const rawLine of frame.split(/\r?\n/)) {
      if (!rawLine || rawLine.startsWith(':')) continue;
      if (rawLine.startsWith('event:')) {
        eventName = rawLine.slice(6).trim();
      } else if (rawLine.startsWith('data:')) {
        dataLines.push(rawLine.slice(5).replace(/^ /, ''));
      }
    }

    if (eventName === 'connected') {
      handlers.onConnected?.();
      return;
    }

    const rawData = dataLines.join('\n');
    if (eventName === 'qa_message' && rawData) {
      try {
        const parsed = JSON.parse(rawData) as AnonymousMessage;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.body === 'string') {
          handlers.onMessage?.(parsed);
        }
      } catch {
        handlers.onSyncRequired?.();
      }
      return;
    }

    if (eventName === 'sync_required') {
      handlers.onSyncRequired?.();
      return;
    }

    if (eventName === 'exchange_reset') {
      handlers.onExchangeReset?.();
    }
  };

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (frame.trim()) {
          dispatchFrame(frame);
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
