import { useEffect, useRef, useState } from 'react';
import { EyeIcon, EyeOffIcon, ExternalLinkIcon, LockIcon, SpinnerIcon } from './Icons';
import { formatParticipantName, validateExternalUrl } from '../lib/validation';
import type { Assignment, Participant } from '../types/database';

const PEEK_DURATION_SECONDS = 10;

interface RevealCardProps {
  assignment: Assignment;
  recipient: Participant | null;
  onUnseal: () => Promise<void>;
}

function SafeItemLink({ url, disabled }: { url: string | null | undefined; disabled?: boolean }) {
  if (!url) return null;
  try {
    const safeUrl = validateExternalUrl(url);
    if (!safeUrl) return null;
    if (disabled) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
          View link
          <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
        </span>
      );
    }
    return (
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-pine underline-offset-2 hover:underline"
      >
        View link
        <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
      </a>
    );
  } catch {
    return null;
  }
}

function WaxSealEmblem() {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-seal/25 bg-seal/10 shadow-sm"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-seal text-white shadow-inner">
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
          <path
            d="M12 13L7.5 8.5Q6 7.2 4.5 8.5L3 10.5Q2.5 11.4 2.5 12.6V15.6Q2.5 17.6 4.5 17.6H11.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 13L24.5 8.5Q26 7.2 27.5 8.5L29 10.5Q29.5 11.4 29.5 12.6V15.6Q29.5 17.6 27.5 17.6H20.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11 18.5L8 26.5L11.5 24.5L14 26.5L15 18.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 18.5L24 26.5L20.5 24.5L18 26.5L17 18.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="11.5" y="11" width="9" height="8" rx="2.5" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

export function RevealCard({ assignment, recipient, onUnseal }: RevealCardProps) {
  const [unsealing, setUnsealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [peekSessionId, setPeekSessionId] = useState(0);

  const activeTimersRef = useRef<Set<number>>(new Set());
  const opSeqRef = useRef(0);
  const hideBtnRef = useRef<HTMLButtonElement>(null);
  const peekBtnRef = useRef<HTMLButtonElement>(null);

  const isPeeking = secondsLeft > 0;

  useEffect(() => {
    const timers = activeTimersRef.current;
    return () => {
      opSeqRef.current += 1;
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    opSeqRef.current += 1;
    setSecondsLeft(0);
    setUnsealing(false);
    setError(null);
  }, [assignment.id]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    const handleVisibilityOrBlur = () => {
      if (document.visibilityState === 'hidden') {
        setSecondsLeft(0);
      }
    };
    const handleWindowBlur = () => {
      setSecondsLeft(0);
    };
    document.addEventListener('visibilitychange', handleVisibilityOrBlur);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const waitAtLeast = (ms: number) => {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timerId = window.setTimeout(() => {
        activeTimersRef.current.delete(timerId);
        resolve();
      }, ms);
      activeTimersRef.current.add(timerId);
    });
  };

  const startPeek = () => {
    setPeekSessionId((id) => id + 1);
    setSecondsLeft(PEEK_DURATION_SECONDS);
    window.requestAnimationFrame(() => {
      hideBtnRef.current?.focus();
    });
  };

  const hideNow = () => {
    setSecondsLeft(0);
    window.requestAnimationFrame(() => {
      peekBtnRef.current?.focus();
    });
  };

  const handleUnseal = async () => {
    const opSeq = ++opSeqRef.current;
    setError(null);
    setUnsealing(true);
    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      await Promise.all([onUnseal(), waitAtLeast(reduced ? 0 : 400)]);
      if (opSeqRef.current !== opSeq) return;
      setPeekSessionId((id) => id + 1);
      setSecondsLeft(PEEK_DURATION_SECONDS);
      window.requestAnimationFrame(() => {
        if (opSeqRef.current !== opSeq) return;
        hideBtnRef.current?.focus();
      });
    } catch (unsealErr) {
      if (opSeqRef.current !== opSeq) return;
      setError(unsealErr instanceof Error ? unsealErr.message : 'Unable to reveal match.');
    } finally {
      if (opSeqRef.current === opSeq) {
        setUnsealing(false);
      }
    }
  };

  if (!assignment.revealed_at) {
    return (
      <section className="relative overflow-hidden rounded-xl border border-hairline bg-surface p-7 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pine via-hairline to-seal"
        />
        <div className="mx-auto flex max-w-lg flex-col items-center space-y-4 text-center">
          <WaxSealEmblem />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-seal">
              Private assignment
            </p>
            <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Your match is sealed
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Coast clear? Peek for {PEEK_DURATION_SECONDS} seconds before it blurs.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-seal">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={unsealing}
              onClick={() => void handleUnseal()}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-seal px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-seal-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unsealing && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
              {unsealing ? 'Breaking seal...' : `Break seal & peek (${PEEK_DURATION_SECONDS}s)`}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in relative overflow-hidden rounded-xl border border-hairline bg-surface">
      {isPeeking && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-20 h-1 bg-surface-subtle"
        >
          <div
            key={peekSessionId}
            className="h-full bg-pine transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
            style={{
              width: `${Math.max(0, Math.round(((secondsLeft - 1) / PEEK_DURATION_SECONDS) * 100))}%`,
            }}
          />
        </div>
      )}

      <div className="relative min-h-[260px] p-6 sm:p-8">
        <div
          aria-hidden={!isPeeking}
          inert={!isPeeking ? true : undefined}
          className={`transition-all duration-200 motion-reduce:transition-none ${
            isPeeking
              ? 'filter-none opacity-100'
              : 'pointer-events-none select-none blur-[14px] opacity-65 motion-reduce:opacity-10'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-seal">
                Your Anonymous Gifter match
              </p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-ink">
                {recipient
                  ? formatParticipantName(recipient.display_name, recipient.alias)
                  : 'Assigned participant'}
              </h2>
            </div>

            {isPeeking && (
              <div className="flex items-center gap-3 pt-1">
                <span
                  aria-live="off"
                  className="rounded-full bg-surface-subtle px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-ink-muted"
                >
                  {secondsLeft}s left
                </span>
                <button
                  ref={hideBtnRef}
                  type="button"
                  onClick={hideNow}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-subtle px-3 text-xs font-medium text-ink transition-colors hover:bg-hairline/60 active:scale-[0.98]"
                >
                  <EyeOffIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Hide
                </button>
              </div>
            )}
          </div>

          {!recipient ? (
            <p className="mt-4 text-sm text-ink-muted">
              Recipient wishlist details could not be loaded. Try refreshing the page.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Wishlist</h3>
                {recipient.wishlist_items.length === 0 ? (
                  <p className="mt-1.5 text-sm text-ink-muted">
                    No gift ideas yet — ask in Anonymous Q&amp;A.
                  </p>
                ) : (
                  <ul className="mt-2.5 divide-y divide-hairline rounded-lg border border-hairline bg-surface-subtle/35">
                    {recipient.wishlist_items.map((item, idx) => (
                      <li key={`${item.title}-${idx}`} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{item.title}</span>
                          <SafeItemLink url={item.url} disabled={!isPeeking} />
                        </div>
                        {item.notes && (
                          <p className="mt-1 text-xs text-ink-muted">{item.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(recipient.dislikes || recipient.delivery_notes) && (
                <div className="grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
                  {recipient.dislikes && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Dislikes &amp; allergies
                      </h3>
                      <p className="mt-1 text-sm text-ink">{recipient.dislikes}</p>
                    </div>
                  )}
                  {recipient.delivery_notes && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Delivery or handoff note
                      </h3>
                      <p className="mt-1 text-sm text-ink">{recipient.delivery_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!isPeeking && (
          <div className="glossy-privacy-veil absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center">
            <span
              aria-hidden="true"
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface text-pine shadow-sm"
            >
              <LockIcon className="h-4 w-4" />
            </span>
            <h2 className="font-display text-2xl font-semibold text-ink">Match hidden</h2>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-ink-muted">
              No peeking — kept under wraps until you tap.
            </p>
            <button
              ref={peekBtnRef}
              type="button"
              onClick={startPeek}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-pine px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-pine-hover active:scale-[0.98]"
            >
              <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Peek ({PEEK_DURATION_SECONDS}s)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
