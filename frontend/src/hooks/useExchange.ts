import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, sendQaMessage, subscribeQaStream, withFreshTokenRetry } from '../lib/api';
import { subscribeLocalDebug } from '../lib/localDebugStore';
import { DataApiError, neonDataApi } from '../lib/neon';
import { detectIdentityLeak } from '../lib/validation';
import type {
  AnonymousMessage,
  AnonymousSenderRole,
  Assignment,
  Exchange,
  Exclusion,
  Participant,
  WishlistItem,
} from '../types/database';
import { useAuth } from './useAuth';

export type LiveConnectionStatus = 'idle' | 'live' | 'polling';

export interface WishlistUpdateInput {
  display_name: string;
  alias?: string;
  wishlist_items: WishlistItem[];
  dislikes: string;
  delivery_notes: string;
}

function mergeMessages(
  prev: AnonymousMessage[],
  incoming: AnonymousMessage[],
): AnonymousMessage[] {
  const byId = new Map<string, AnonymousMessage>();
  for (const msg of prev) {
    byId.set(msg.id, msg);
  }
  for (const msg of incoming) {
    byId.set(msg.id, msg);
  }
  return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useExchange(exchangeId: string | undefined) {
  const { user, loading: authLoading, getAccessToken } = useAuth();
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [myAssignment, setMyAssignment] = useState<Assignment | null>(null);
  const [messages, setMessages] = useState<AnonymousMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveConnectionStatus>('idle');
  const loadedExchangeIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!exchangeId || !user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const isRefresh = loadedExchangeIdRef.current === exchangeId;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const ex = await neonDataApi.selectSingle<Exchange>('exchanges', {
        eq: { id: exchangeId },
      });
      if (!ex) {
        loadedExchangeIdRef.current = null;
        setExchange(null);
        setParticipants([]);
        setExclusions([]);
        setMyAssignment(null);
        setMessages([]);
        setError('Exchange not found or you do not have access.');
        return;
      }

      const memberPromise = neonDataApi.select<Participant>('participants', {
        eq: { exchange_id: exchangeId },
        order: 'joined_at.asc',
      });
      const exclusionsPromise =
        ex.organizer_id === user.id
          ? neonDataApi.select<Exclusion>('exclusions', {
              eq: { exchange_id: exchangeId },
              order: 'created_at.asc',
            })
          : Promise.resolve<Exclusion[]>([]);
      const assignmentPromise =
        ex.status === 'drawn' || ex.status === 'completed'
          ? neonDataApi.selectSingle<Assignment>('assignments', {
              eq: { exchange_id: exchangeId },
            })
          : Promise.resolve<Assignment | null>(null);
      const messagesPromise =
        ex.status === 'drawn' || ex.status === 'completed'
          ? neonDataApi.select<AnonymousMessage>('anonymous_messages', {
              eq: { exchange_id: exchangeId },
              order: 'created_at.asc',
            })
          : Promise.resolve<AnonymousMessage[]>([]);

      const [memberRows, exclusionRows, assignmentRow, messageRows] = await Promise.all([
        memberPromise,
        exclusionsPromise,
        assignmentPromise,
        messagesPromise,
      ]);

      loadedExchangeIdRef.current = exchangeId;
      setExchange(ex);
      setParticipants(memberRows);
      setExclusions(exclusionRows);
      setMyAssignment(assignmentRow);
      setMessages(messageRows);
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : 'Unable to load exchange.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, exchangeId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshMessagesOnly = useCallback(async () => {
    if (!exchangeId || !user) return;
    try {
      const messageRows = await neonDataApi.select<AnonymousMessage>('anonymous_messages', {
        eq: { exchange_id: exchangeId },
        order: 'created_at.asc',
      });
      setMessages(messageRows);
    } catch {
      // Silent background sync; explicit actions surface errors directly
    }
  }, [exchangeId, user]);

  const isExchangeDrawn =
    exchange?.status === 'drawn' || exchange?.status === 'completed';

  useEffect(() => {
    if (!exchangeId || !user || !isExchangeDrawn) {
      setLiveStatus('idle');
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshMessagesOnly();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (__LOCAL_DEBUG__) {
      setLiveStatus('live');
      const unsubscribe = subscribeLocalDebug(() => {
        void refreshMessagesOnly();
      });
      return () => {
        unsubscribe();
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    const controller = new AbortController();
    let backoffMs = 3000;
    let needResyncOnReconnect = false;

    const waitBackoff = (ms: number) =>
      new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        const timer = window.setTimeout(() => {
          controller.signal.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        const onAbort = () => {
          window.clearTimeout(timer);
          resolve();
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });

    const runStreamLoop = async () => {
      setLiveStatus('polling');
      while (!controller.signal.aborted) {
        try {
          await subscribeQaStream(
            exchangeId,
            getAccessToken,
            {
              onConnected: () => {
                setLiveStatus('live');
                backoffMs = 3000;
                if (needResyncOnReconnect) {
                  void refreshMessagesOnly();
                }
                needResyncOnReconnect = true;
              },
              onMessage: (msg) => {
                setMessages((prev) => mergeMessages(prev, [msg]));
              },
              onSyncRequired: () => {
                void refreshMessagesOnly();
              },
              onExchangeReset: () => {
                void load();
              },
            },
            controller.signal,
          );
        } catch {
          // Stream dropped or backend offline; quietly fall back to Data API polling
        }

        if (controller.signal.aborted) {
          break;
        }
        setLiveStatus('polling');
        needResyncOnReconnect = true;
        await waitBackoff(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    };

    void runStreamLoop();

    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [exchangeId, getAccessToken, isExchangeDrawn, load, refreshMessagesOnly, user]);

  useEffect(() => {
    if (__LOCAL_DEBUG__ || !exchangeId || !user || !isExchangeDrawn) {
      return;
    }
    if (liveStatus !== 'polling') {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshMessagesOnly();
      }
    }, 3_500);
    return () => window.clearInterval(intervalId);
  }, [exchangeId, isExchangeDrawn, liveStatus, refreshMessagesOnly, user]);

  const myParticipant = useMemo(
    () => (user ? participants.find((p) => p.user_id === user.id) ?? null : null),
    [participants, user],
  );

  const recipient = useMemo(() => {
    if (!myAssignment) return null;
    return participants.find((p) => p.user_id === myAssignment.recipient_id) ?? null;
  }, [myAssignment, participants]);

  const outgoingMessages = useMemo(() => {
    if (!myAssignment) return [];
    return messages.filter((msg) => msg.assignment_id === myAssignment.id);
  }, [messages, myAssignment]);

  const incomingMessages = useMemo(() => {
    if (!myAssignment) return messages;
    return messages.filter((msg) => msg.assignment_id !== myAssignment.id);
  }, [messages, myAssignment]);

  const incomingAssignmentId = useMemo(
    () => (incomingMessages.length > 0 ? incomingMessages[0].assignment_id : null),
    [incomingMessages],
  );

  const updateMyWishlist = useCallback(
    async (input: WishlistUpdateInput) => {
      if (!exchangeId || !user) return;
      const effectiveDisplayName = (user.name ?? '').trim() || input.display_name;
      let cleanedAlias = (input.alias ?? '').trim().slice(0, 40);
      const comparisonName = myParticipant?.display_name ?? effectiveDisplayName;
      if (cleanedAlias.toLowerCase() === comparisonName.trim().toLowerCase()) {
        cleanedAlias = '';
      }
      if (myParticipant) {
        const updated = await neonDataApi.update<Participant>(
          'participants',
          { id: myParticipant.id },
          {
            alias: cleanedAlias,
            wishlist_items: input.wishlist_items,
            dislikes: input.dislikes,
            delivery_notes: input.delivery_notes,
          },
        );
        if (updated[0]) {
          setParticipants((prev) =>
            prev.map((row) => (row.id === updated[0].id ? updated[0] : row)),
          );
        }
      } else {
        const inserted = await neonDataApi.insert<Participant>('participants', {
          exchange_id: exchangeId,
          display_name: effectiveDisplayName,
          alias: cleanedAlias,
          wishlist_items: input.wishlist_items,
          dislikes: input.dislikes,
          delivery_notes: input.delivery_notes,
        });
        if (inserted[0]) {
          setParticipants((prev) => [...prev, inserted[0]]);
        }
      }
    },
    [exchangeId, myParticipant, user],
  );

  const addExclusion = useCallback(
    async (giverParticipantId: string, excludedParticipantId: string, mutual: boolean) => {
      if (!exchangeId) return;
      const rows: Array<Record<string, unknown>> = [
        {
          exchange_id: exchangeId,
          giver_participant_id: giverParticipantId,
          excluded_participant_id: excludedParticipantId,
        },
      ];
      if (mutual) {
        rows.push({
          exchange_id: exchangeId,
          giver_participant_id: excludedParticipantId,
          excluded_participant_id: giverParticipantId,
        });
      }
      await neonDataApi.insert<Exclusion>('exclusions', rows);
      await load();
    },
    [exchangeId, load],
  );

  const removeExclusion = useCallback(async (exclusionId: string) => {
    await neonDataApi.remove('exclusions', { id: exclusionId });
    setExclusions((prev) => prev.filter((item) => item.id !== exclusionId));
  }, []);

  const unsealAssignment = useCallback(async () => {
    if (!myAssignment) return;
    const nowIso = new Date().toISOString();
    const updated = await neonDataApi.update<Assignment>(
      'assignments',
      { id: myAssignment.id },
      { revealed_at: nowIso },
    );
    if (updated[0]) {
      setMyAssignment(updated[0]);
    }
  }, [myAssignment]);

  const sendAnonymousMessage = useCallback(
    async (assignmentId: string, senderRole: AnonymousSenderRole, body: string) => {
      if (!exchangeId) return;
      const trimmedBody = body.trim();
      const leakCheck = detectIdentityLeak(trimmedBody, {
        displayName: myParticipant?.display_name,
        alias: myParticipant?.alias,
        email: user?.email,
        accountName: user?.name,
      });
      if (leakCheck.blocked) {
        throw new Error(leakCheck.reason ?? 'Identity clues are blocked in Anonymous Q&A.');
      }

      try {
        const inserted = await withFreshTokenRetry(getAccessToken, (token) =>
          sendQaMessage(
            exchangeId,
            {
              assignment_id: assignmentId,
              sender_role: senderRole,
              body: trimmedBody,
            },
            token,
          ),
        );
        setMessages((prev) => mergeMessages(prev, [inserted]));
      } catch (err) {
        if (err instanceof ApiError && err.status < 500) {
          throw err;
        }
        try {
          const inserted = await neonDataApi.insert<AnonymousMessage>('anonymous_messages', {
            exchange_id: exchangeId,
            assignment_id: assignmentId,
            sender_role: senderRole,
            body: trimmedBody,
          });
          if (inserted[0]) {
            setMessages((prev) => mergeMessages(prev, [inserted[0]]));
          }
        } catch (fallbackErr) {
          if (fallbackErr instanceof DataApiError) {
            throw fallbackErr;
          }
          throw new Error('Could not send right now. Check your connection and try again.');
        }
      }
    },
    [exchangeId, getAccessToken, myParticipant, user],
  );

  const updateTargetParticipants = useCallback(
    async (target: number | null) => {
      if (!exchangeId) return;
      const updated = await neonDataApi.update<Exchange>(
        'exchanges',
        { id: exchangeId },
        { target_participants: target },
      );
      if (updated[0]) {
        setExchange(updated[0]);
      }
    },
    [exchangeId],
  );

  return {
    exchange,
    participants,
    exclusions,
    myParticipant,
    myAssignment,
    recipient,
    outgoingMessages,
    incomingMessages,
    incomingAssignmentId,
    loading: loading || authLoading,
    refreshing,
    error,
    liveStatus,
    reload: load,
    updateMyWishlist,
    updateTargetParticipants,
    addExclusion,
    removeExclusion,
    unsealAssignment,
    sendAnonymousMessage,
  };
}
