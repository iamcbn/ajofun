import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ExclusionsPanel } from '../components/ExclusionsPanel';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  ShuffleIcon,
  SpinnerIcon,
} from '../components/Icons';
import { InviteShareCard } from '../components/InviteShareCard';
import { ExchangeWaitingBanner } from '../components/LoadingPlaceholders';
import { WishlistForm } from '../components/WishlistForm';
import { resetDraw, triggerDraw, withFreshTokenRetry } from '../lib/api';
import { validateExternalUrl } from '../lib/validation';
import { useExchangeOutlet } from './ExchangeLayout';

function getSafeExternalHref(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return validateExternalUrl(rawUrl);
  } catch {
    return null;
  }
}

export function ExchangePage() {
  const {
    exchange,
    participants,
    exclusions,
    myParticipant,
    myAssignment,
    outgoingMessages,
    incomingMessages,
    liveStatus,
    user,
    isOrganizer,
    isDrawn,
    targetCount,
    isFull,
    spotsRemaining,
    canDraw,
    inviteUrl,
    getAccessToken,
    reload,
    updateMyWishlist,
    updateTargetParticipants,
    addExclusion,
    removeExclusion,
  } = useExchangeOutlet();

  const wishlistSectionRef = useRef<HTMLElement>(null);
  const confirmDrawCancelRef = useRef<HTMLButtonElement>(null);
  const drawTriggerBtnRef = useRef<HTMLButtonElement>(null);
  const confirmResetCancelRef = useRef<HTMLButtonElement>(null);
  const resetTriggerBtnRef = useRef<HTMLButtonElement>(null);
  const activeTimersRef = useRef<Set<number>>(new Set());
  const opSeqRef = useRef(0);

  const [editingWishlist, setEditingWishlist] = useState(false);
  const [savingWishlist, setSavingWishlist] = useState(false);
  const [wishlistSaved, setWishlistSaved] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mobileInviteOpen, setMobileInviteOpen] = useState(false);
  const [resetDisclosureOpen, setResetDisclosureOpen] = useState(false);

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
    if (exchange.status !== 'open') {
      setConfirmDraw(false);
      setDrawing(false);
    } else {
      setConfirmReset(false);
      setResetting(false);
      setResetDisclosureOpen(false);
    }
  }, [exchange.status]);

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

  const isCompleted = exchange.status === 'completed';
  const canEditWishlist = !isCompleted;
  const minRequiredRemaining = Math.max(0, 3 - participants.length);

  const openWishlistEditor = () => {
    setWishlistSaved(false);
    setEditingWishlist(true);
    window.requestAnimationFrame(() => {
      const target = wishlistSectionRef.current;
      if (!target) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const handleStartEditLimit = () => {
    setLimitError(null);
    setLimitDraft(targetCount !== null ? String(targetCount) : '');
    setEditingLimit(true);
  };

  const handleSaveLimit = async (nextLimit: number | null) => {
    setLimitError(null);
    if (nextLimit !== null) {
      if (!Number.isInteger(nextLimit) || nextLimit < 3) {
        setLimitError('Participant limit must be a whole number of at least 3.');
        return;
      }
      if (nextLimit < participants.length) {
        setLimitError(
          `Limit cannot be lower than the ${participants.length} participants already joined.`,
        );
        return;
      }
    }
    setSavingLimit(true);
    try {
      await updateTargetParticipants(nextLimit);
      setEditingLimit(false);
    } catch (err) {
      setLimitError(err instanceof Error ? err.message : 'Could not update participant limit.');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleLimitSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = limitDraft.trim();
    if (!trimmed) {
      void handleSaveLimit(null);
      return;
    }
    void handleSaveLimit(Number(trimmed));
  };

  const handleDraw = async () => {
    const opSeq = ++opSeqRef.current;
    setDrawError(null);
    setDrawing(true);
    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      await Promise.all([
        withFreshTokenRetry(getAccessToken, (token) => triggerDraw(exchange.id, token)),
        waitAtLeast(reduced ? 0 : 400),
      ]);
      if (opSeqRef.current !== opSeq) return;
      setConfirmDraw(false);
      await reload();
      if (opSeqRef.current !== opSeq) return;
    } catch (err) {
      if (opSeqRef.current !== opSeq) return;
      setDrawError(err instanceof Error ? err.message : 'Unable to complete the draw.');
    } finally {
      if (opSeqRef.current === opSeq) {
        setDrawing(false);
      }
    }
  };

  const handleResetDraw = async () => {
    const opSeq = ++opSeqRef.current;
    setDrawError(null);
    setResetting(true);
    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      await Promise.all([
        withFreshTokenRetry(getAccessToken, (token) => resetDraw(exchange.id, token)),
        waitAtLeast(reduced ? 0 : 400),
      ]);
      if (opSeqRef.current !== opSeq) return;
      setConfirmReset(false);
      setResetDisclosureOpen(false);
      await reload();
      if (opSeqRef.current !== opSeq) return;
    } catch (err) {
      if (opSeqRef.current !== opSeq) return;
      setDrawError(err instanceof Error ? err.message : 'Unable to reset draw.');
    } finally {
      if (opSeqRef.current === opSeq) {
        setResetting(false);
      }
    }
  };

  const totalQaMessages = outgoingMessages.length + incomingMessages.length;
  const myItems = myParticipant?.wishlist_items ?? [];
  const myDislikes = (myParticipant?.dislikes ?? '').trim();
  const myDeliveryNotes = (myParticipant?.delivery_notes ?? '').trim();
  const hasAnyWishlistContent =
    myItems.length > 0 || Boolean(myDislikes) || Boolean(myDeliveryNotes);

  const preDrawHeadline = canDraw
    ? 'Ready to draw names'
    : targetCount !== null
      ? `Waiting for ${spotsRemaining} more ${spotsRemaining === 1 ? 'participant' : 'participants'}`
      : `Need ${minRequiredRemaining} more to draw (min 3)`;

  const primaryColumn = (
    <div className="space-y-6">
      {!isDrawn &&
        (isOrganizer ? (
          <section
            aria-label="Draw readiness"
            className="rounded-xl border border-hairline bg-surface p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-semibold text-ink">
                  {preDrawHeadline}
                </h2>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Assignments run blindly on the server so even the host stays surprised.
                </p>
              </div>

              {(!confirmDraw || !canDraw) && (
                <button
                  ref={drawTriggerBtnRef}
                  type="button"
                  disabled={!canDraw}
                  onClick={() => {
                    setDrawError(null);
                    setConfirmDraw(true);
                    window.requestAnimationFrame(() => {
                      confirmDrawCancelRef.current?.focus();
                    });
                  }}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-seal px-4 text-sm font-medium text-white transition-colors hover:bg-seal-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShuffleIcon className="h-4 w-4" aria-hidden="true" />
                  Draw names now
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                {canDraw && <CheckIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />}
                <span className={canDraw ? 'font-medium text-ink' : undefined}>
                  Roster:{' '}
                  {targetCount !== null
                    ? `${participants.length} of ${targetCount} joined`
                    : `${participants.length} joined (min 3)`}
                </span>
              </span>
              <span>
                Exclusions:{' '}
                {exclusions.length > 0
                  ? `${exclusions.length} active`
                  : 'None'}
              </span>
              {myParticipant && (
                <span className="inline-flex items-center gap-1.5">
                  {myItems.length > 0 && (
                    <CheckIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
                  )}
                  <span>
                    Your wishlist:{' '}
                    {myItems.length > 0
                      ? `${myItems.length} ${myItems.length === 1 ? 'idea' : 'ideas'}`
                      : 'Open to surprises'}
                  </span>
                </span>
              )}
            </div>

            {drawError && (
              <div
                role="alert"
                className="rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-xs text-seal"
              >
                {drawError}
              </div>
            )}

            {drawing && (
              <div
                role="status"
                aria-live="polite"
                className="overflow-hidden rounded-md border border-seal/30 bg-seal/5"
              >
                <div className="h-0.5 w-full overflow-hidden bg-seal/15" aria-hidden="true">
                  <div className="animate-progress-bar h-full rounded-full bg-seal" />
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-seal">
                  <SpinnerIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Shuffling participants &amp; verifying exclusions...</span>
                </div>
              </div>
            )}

            {confirmDraw && canDraw && !drawing && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-subtle/60 px-4 py-3">
                <p className="text-sm text-ink">
                  Lock sign-ups and match all {participants.length} participants?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    ref={confirmDrawCancelRef}
                    type="button"
                    onClick={() => {
                      setConfirmDraw(false);
                      window.requestAnimationFrame(() => {
                        drawTriggerBtnRef.current?.focus();
                      });
                    }}
                    className="h-9 rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDraw()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-seal px-3.5 text-xs font-medium text-white hover:bg-seal-hover"
                  >
                    Confirm blind draw
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <ExchangeWaitingBanner
            participantsCount={participants.length}
            targetCount={targetCount}
            isOrganizer={isOrganizer}
            hasJoined={Boolean(myParticipant)}
            myDisplayName={myParticipant?.display_name ?? null}
            myWishlistCount={myItems.length}
            canDraw={canDraw}
            onJumpToWishlist={openWishlistEditor}
          />
        ))}

      {isDrawn && (
        <section aria-label="Drawn exchange shortcuts" className="grid gap-4 sm:grid-cols-2">
          {myAssignment ? (
            <Link
              to={`/exchanges/${exchange.id}/match`}
              className="group flex flex-col justify-between gap-3 rounded-xl border border-hairline bg-surface p-5 transition-all hover:border-pine/40 hover:shadow-sm"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Your Secret Match
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      myAssignment.revealed_at
                        ? 'bg-surface-subtle text-ink-muted'
                        : 'bg-seal/10 text-seal'
                    }`}
                  >
                    {myAssignment.revealed_at ? 'Hidden' : 'Sealed'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">
                  {myAssignment.revealed_at
                    ? 'Hidden under a privacy veil; peek for 10 seconds at a time.'
                    : 'Break the seal privately to view who you drew.'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pine group-hover:underline underline-offset-4">
                Open Secret Match
                <ArrowRightIcon
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ) : (
            <div className="flex flex-col justify-center rounded-xl border border-hairline bg-surface p-5 text-sm text-ink-muted">
              You organized this exchange without joining as a participant, so you do not have an outgoing match.
            </div>
          )}

          {myParticipant ? (
            <Link
              to={`/exchanges/${exchange.id}/qa`}
              className="group flex flex-col justify-between gap-3 rounded-xl border border-hairline bg-surface p-5 transition-all hover:border-pine/40 hover:shadow-sm"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Anonymous Q&amp;A
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    {liveStatus === 'live' && (
                      <span className="h-1.5 w-1.5 rounded-full bg-pine" aria-hidden="true" />
                    )}
                    {totalQaMessages} {totalQaMessages === 1 ? 'message' : 'messages'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Ask your match questions or reply to your Anonymous Gifter
                  {incomingMessages.length > 0
                    ? ` (${incomingMessages.length} from your Gifter).`
                    : '.'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pine group-hover:underline underline-offset-4">
                Open Anonymous Q&amp;A
                <ArrowRightIcon
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ) : (
            <div className="flex flex-col justify-center rounded-xl border border-hairline bg-surface p-5 text-sm text-ink-muted">
              Anonymous Q&amp;A is only available to joined participants.
            </div>
          )}
        </section>
      )}

      {canEditWishlist && (myParticipant || !isDrawn) && (
        <section
          ref={wishlistSectionRef}
          className="rounded-xl border border-hairline bg-surface p-5 sm:p-6 space-y-4"
        >
          {!myParticipant ? (
            editingWishlist && !isFull ? (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Join the participant list
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Add optional gift ideas, dislikes, or delivery notes for your Anonymous Gifter.
                  </p>
                </div>
                <WishlistForm
                  key={`${exchange.id}-${user.id}-new`}
                  initialValues={{
                    display_name: user.name ?? '',
                    alias: '',
                    wishlist_items: [],
                    dislikes: '',
                    delivery_notes: '',
                  }}
                  lockDisplayName={Boolean((user.name ?? '').trim())}
                  submitLabel="Join as participant"
                  submitting={savingWishlist}
                  onCancel={() => setEditingWishlist(false)}
                  onSubmit={async (values) => {
                    setWishlistSaved(false);
                    setSavingWishlist(true);
                    try {
                      await updateMyWishlist(values);
                      setWishlistSaved(true);
                      setEditingWishlist(false);
                    } finally {
                      setSavingWishlist(false);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">
                  {isFull
                    ? `You're hosting without participating in the draw (all ${targetCount} spots are filled — raise the limit to join).`
                    : "You're hosting without participating in the draw."}
                </p>
                {!isFull && (
                  <button
                    type="button"
                    onClick={() => setEditingWishlist(true)}
                    className="inline-flex h-9 shrink-0 items-center rounded-md bg-pine px-3.5 text-xs font-medium text-white transition-colors hover:bg-pine-hover"
                  >
                    Join as participant
                  </button>
                )}
              </div>
            )
          ) : editingWishlist ? (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Your wishlist
                </h2>
                <p className="text-xs text-ink-muted">
                  Gift ideas, dislikes, and delivery notes are shared privately with your Anonymous Gifter.
                </p>
              </div>
              <WishlistForm
                key={`${exchange.id}-${user.id}-${myParticipant.id}`}
                initialValues={{
                  display_name: myParticipant.display_name,
                  alias: myParticipant.alias ?? '',
                  wishlist_items: myItems,
                  dislikes: myParticipant.dislikes ?? '',
                  delivery_notes: myParticipant.delivery_notes ?? '',
                }}
                lockDisplayName={Boolean((myParticipant.display_name || user.name || '').trim())}
                submitLabel="Save wishlist"
                submitting={savingWishlist}
                onCancel={() => setEditingWishlist(false)}
                onSubmit={async (values) => {
                  setWishlistSaved(false);
                  setSavingWishlist(true);
                  try {
                    await updateMyWishlist(values);
                    setWishlistSaved(true);
                    setEditingWishlist(false);
                  } finally {
                    setSavingWishlist(false);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Your wishlist
                  </h2>
                  {wishlistSaved && (
                    <span
                      role="status"
                      className="rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-medium text-pine"
                    >
                      Saved
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWishlistSaved(false);
                    setEditingWishlist(true);
                  }}
                  className={
                    hasAnyWishlistContent
                      ? 'inline-flex h-9 items-center rounded-md border border-hairline bg-surface-subtle/60 px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle'
                      : 'inline-flex h-9 items-center rounded-md bg-pine px-3.5 text-xs font-medium text-white transition-colors hover:bg-pine-hover'
                  }
                >
                  {hasAnyWishlistContent ? 'Edit wishlist' : '+ Add gift ideas'}
                </button>
              </div>

              {!hasAnyWishlistContent ? (
                <p className="text-sm text-ink-muted">
                  No gift ideas or delivery notes yet. Add a few hints for your Anonymous Gifter.
                </p>
              ) : (
                <div className="space-y-4">
                  {myItems.length > 0 ? (
                    <ul className="divide-y divide-hairline border-t border-hairline">
                      {myItems.map((item, idx) => {
                        const safeHref = getSafeExternalHref(item.url);
                        return (
                          <li key={`${item.title}-${idx}`} className="py-3 first:pt-3 last:pb-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-ink">{item.title}</span>
                              {safeHref && (
                                <a
                                  href={safeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-pine underline-offset-2 hover:underline"
                                >
                                  View link
                                  <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-xs text-ink-muted">{item.notes}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
                      No specific gift ideas listed (open to surprises).
                    </p>
                  )}

                  {(myDislikes || myDeliveryNotes) && (
                    <dl className="grid gap-4 border-t border-hairline pt-3.5 text-xs sm:grid-cols-2">
                      {myDislikes && (
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-ink-muted">
                            Dislikes &amp; allergies
                          </dt>
                          <dd className="mt-1 text-sm text-ink">{myDislikes}</dd>
                        </div>
                      )}
                      {myDeliveryNotes && (
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-ink-muted">
                            Delivery note
                          </dt>
                          <dd className="mt-1 text-sm text-ink">{myDeliveryNotes}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );

  const secondaryRail = (
    <div className="space-y-6">
      {!isDrawn && (
        <>
          <div className="lg:hidden">
            {mobileInviteOpen ? (
              <div className="space-y-2">
                <InviteShareCard
                  exchange={exchange}
                  inviteUrl={inviteUrl}
                  isFull={isFull}
                  participantsCount={participants.length}
                  targetCount={targetCount}
                  compactHeader
                />
                <button
                  type="button"
                  onClick={() => setMobileInviteOpen(false)}
                  className="text-xs font-medium text-ink-muted hover:text-ink"
                >
                  Hide invite options
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-expanded={false}
                onClick={() => setMobileInviteOpen(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-subtle/50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="font-display text-base font-semibold text-ink">
                    Invite group
                  </span>
                  <span className="rounded border border-hairline bg-surface-subtle px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
                    {exchange.invite_code}
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine">
                  Share link
                  <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>
            )}
          </div>

          <div className="hidden lg:block">
            <InviteShareCard
              exchange={exchange}
              inviteUrl={inviteUrl}
              isFull={isFull}
              participantsCount={participants.length}
              targetCount={targetCount}
            />
          </div>
        </>
      )}

      <section className="rounded-xl border border-hairline bg-surface p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Participants</h2>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-ink-muted">
              {targetCount !== null
                ? `${participants.length} of ${targetCount} joined`
                : `${participants.length} joined`}
            </span>
            {isOrganizer && !isDrawn && !editingLimit && (
              <button
                type="button"
                onClick={handleStartEditLimit}
                className="rounded-md border border-hairline bg-surface-subtle/60 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
              >
                {targetCount !== null ? 'Edit limit' : 'Set limit'}
              </button>
            )}
          </div>
        </div>

        {targetCount !== null && !isDrawn && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full bg-pine transition-all"
              style={{
                width: `${Math.min(100, Math.round((participants.length / targetCount) * 100))}%`,
              }}
            />
          </div>
        )}

        {isOrganizer && !isDrawn && editingLimit && (
          <form
            onSubmit={handleLimitSubmit}
            className="space-y-2.5 rounded-lg border border-hairline bg-surface-subtle/40 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="edit-participant-limit" className="text-xs font-medium text-ink">
                Participant limit:
              </label>
              <input
                id="edit-participant-limit"
                type="number"
                min={Math.max(3, participants.length)}
                step="1"
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
                placeholder="No limit"
                disabled={savingLimit}
                className="h-8 w-28 rounded-md border border-hairline bg-surface px-2.5 text-xs text-ink placeholder:text-[#6B6660]"
              />
              <button
                type="submit"
                disabled={savingLimit}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-pine px-3 text-xs font-medium text-white hover:bg-pine-hover disabled:opacity-60"
              >
                {savingLimit && <SpinnerIcon className="h-3 w-3" aria-hidden="true" />}
                {savingLimit ? 'Saving...' : 'Save'}
              </button>
              {targetCount !== null && (
                <button
                  type="button"
                  disabled={savingLimit}
                  onClick={() => void handleSaveLimit(null)}
                  className="h-8 rounded-md border border-hairline bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                disabled={savingLimit}
                onClick={() => {
                  setLimitError(null);
                  setEditingLimit(false);
                }}
                className="h-8 rounded-md border border-hairline bg-surface px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
              >
                Cancel
              </button>
            </div>
            {limitError && (
              <p role="alert" className="text-xs text-seal">
                {limitError}
              </p>
            )}
          </form>
        )}

        {participants.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No one has joined yet. Share the invite link to bring your group in.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {participants.map((member) => {
              const initial = member.display_name.trim().charAt(0).toUpperCase() || '?';
              const cleanAlias = (member.alias ?? '').trim();
              const hasDistinctAlias =
                Boolean(cleanAlias) &&
                cleanAlias.toLowerCase() !== member.display_name.trim().toLowerCase();
              const isMe = member.user_id === user.id;
              const itemCount = member.wishlist_items.length;
              const hasPrefs = Boolean(
                (member.dislikes ?? '').trim() || (member.delivery_notes ?? '').trim(),
              );

              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-subtle text-xs font-semibold text-ink"
                    >
                      {initial}
                    </span>
                    <span className="truncate font-medium text-ink">{member.display_name}</span>
                    {hasDistinctAlias && (
                      <span className="text-xs text-ink-muted">({cleanAlias})</span>
                    )}
                    {member.user_id === exchange.organizer_id && (
                      <span className="rounded-full border border-hairline bg-surface-subtle px-2 py-0.5 text-[11px] text-ink-muted">
                        Host
                      </span>
                    )}
                    {isMe && (
                      <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-medium text-pine">
                        You
                      </span>
                    )}
                  </div>

                  {itemCount > 0 ? (
                    isMe && canEditWishlist ? (
                      <button
                        type="button"
                        onClick={openWishlistEditor}
                        className="rounded-full bg-pine/10 px-2.5 py-0.5 text-xs font-medium text-pine transition-colors hover:bg-pine/15"
                      >
                        {itemCount} {itemCount === 1 ? 'idea' : 'ideas'}
                      </button>
                    ) : (
                      <span className="rounded-full bg-pine/10 px-2.5 py-0.5 text-xs font-medium text-pine">
                        {itemCount} {itemCount === 1 ? 'idea' : 'ideas'}
                      </span>
                    )
                  ) : hasPrefs ? (
                    isMe && canEditWishlist ? (
                      <button
                        type="button"
                        onClick={openWishlistEditor}
                        className="rounded-full border border-hairline bg-surface-subtle px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                      >
                        Notes added
                      </button>
                    ) : (
                      <span className="rounded-full border border-hairline bg-surface-subtle px-2.5 py-0.5 text-xs text-ink-muted">
                        Notes added
                      </span>
                    )
                  ) : isMe && canEditWishlist ? (
                    <button
                      type="button"
                      onClick={openWishlistEditor}
                      className="rounded-full border border-pine/30 bg-pine/5 px-2.5 py-0.5 text-xs font-medium text-pine transition-colors hover:bg-pine/10"
                    >
                      + Add wishlist
                    </button>
                  ) : isDrawn ? (
                    <span className="text-xs text-ink-muted">Open to surprises</span>
                  ) : (
                    <span className="text-xs text-ink-muted">No wishlist yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isOrganizer && !isDrawn && (
        <ExclusionsPanel
          participants={participants}
          exclusions={exclusions}
          onAddExclusion={addExclusion}
          onRemoveExclusion={removeExclusion}
        />
      )}

      {isOrganizer && isDrawn && (
        <section className="rounded-xl border border-hairline bg-surface-subtle/50 p-4 space-y-3">
          <button
            type="button"
            aria-expanded={resetDisclosureOpen}
            onClick={() => setResetDisclosureOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-ink-muted hover:text-ink"
          >
            <span>Need to add a latecomer or reset the draw?</span>
            {resetDisclosureOpen ? (
              <ChevronUpIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
          </button>

          {resetDisclosureOpen && (
            <div className="space-y-3 border-t border-hairline pt-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">
                  Reset draw &amp; reopen sign-ups
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  This clears all current match assignments and permanently deletes Anonymous Q&amp;A history.
                </p>
              </div>

              {drawError && (
                <p role="alert" className="text-xs font-medium text-seal">
                  {drawError}
                </p>
              )}

              {resetting && (
                <div
                  role="status"
                  aria-live="polite"
                  className="overflow-hidden rounded-md border border-hairline bg-surface"
                >
                  <div className="h-0.5 w-full overflow-hidden bg-surface-subtle" aria-hidden="true">
                    <div className="animate-progress-bar h-full rounded-full bg-seal/80" />
                  </div>
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-ink-muted">
                    <SpinnerIcon className="h-3.5 w-3.5 shrink-0 text-seal" aria-hidden="true" />
                    <span>Re-opening sign-ups &amp; clearing current assignments...</span>
                  </div>
                </div>
              )}

              {!confirmReset ? (
                <button
                  ref={resetTriggerBtnRef}
                  type="button"
                  onClick={() => {
                    setDrawError(null);
                    setConfirmReset(true);
                    window.requestAnimationFrame(() => {
                      confirmResetCancelRef.current?.focus();
                    });
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-seal/30 bg-surface px-3 text-xs font-medium text-seal hover:bg-seal/5"
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset draw
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    ref={confirmResetCancelRef}
                    type="button"
                    disabled={resetting}
                    onClick={() => {
                      setConfirmReset(false);
                      window.requestAnimationFrame(() => {
                        resetTriggerBtnRef.current?.focus();
                      });
                    }}
                    className="h-8 rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
                  >
                    Keep current draw
                  </button>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => void handleResetDraw()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-seal px-3.5 text-xs font-medium text-white hover:bg-seal-hover disabled:opacity-60"
                  >
                    {resetting && <SpinnerIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    {resetting ? 'Resetting...' : 'Yes, reset draw'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)] lg:items-start">
      {primaryColumn}
      {secondaryRail}
    </div>
  );
}
