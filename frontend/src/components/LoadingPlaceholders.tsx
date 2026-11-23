import { useEffect, useState } from 'react';
import { ArrowRightIcon, CheckIcon, ShuffleIcon } from './Icons';
import { isDebugLoadingPreview, subscribeLocalDebug } from '../lib/localDebugStore';

export function useDebugLoadingPreview(): boolean {
  const [active, setActive] = useState<boolean>(() =>
    __LOCAL_DEBUG__ ? isDebugLoadingPreview() : false,
  );

  useEffect(() => {
    if (!__LOCAL_DEBUG__) return;
    setActive(isDebugLoadingPreview());
    return subscribeLocalDebug(() => {
      setActive(isDebugLoadingPreview());
    });
  }, []);

  return active;
}

export function HeaderSessionSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="inline-flex h-8 w-28 items-center gap-2 rounded-md border border-hairline bg-surface-subtle/60 px-3"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-pine/70 animate-gentle-pulse"
        aria-hidden="true"
      />
      <span className="skeleton-shimmer h-2.5 flex-1 rounded" aria-hidden="true" />
      <span className="sr-only">Checking your session...</span>
    </div>
  );
}

export function ExchangeListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-lg border border-hairline bg-surface"
    >
      <div className="h-0.5 w-full overflow-hidden bg-surface-subtle" aria-hidden="true">
        <div className="animate-progress-bar h-full rounded-full bg-pine/60" />
      </div>
      <ul className="divide-y divide-hairline" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li
            key={row}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`skeleton-shimmer h-5 rounded ${
                    row === 0 ? 'w-52' : row === 1 ? 'w-44' : 'w-60'
                  }`}
                />
                {row === 0 && <div className="skeleton-shimmer h-4 w-11 rounded-full" />}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="skeleton-shimmer h-3 w-28 rounded" />
                <div className="skeleton-shimmer h-3 w-20 rounded" />
                <div className="skeleton-shimmer h-3 w-16 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer h-5 w-20 rounded-full" />
              <div className="skeleton-shimmer h-4 w-4 rounded" />
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">Loading your exchanges...</span>
    </div>
  );
}

interface HomeHowItWorksSectionProps {
  onStartExchange?: () => void;
}

export function HomeHowItWorksSection({ onStartExchange }: HomeHowItWorksSectionProps) {
  const steps = [
    {
      number: '01',
      title: 'Create the exchange',
      detail:
        'Set your budget, exchange date, and optional group size to generate a private invite link.',
    },
    {
      number: '02',
      title: 'Collect wishlists and exclusions',
      detail:
        'Participants add gift ideas, allergies, and delivery notes while you keep partners from drawing each other.',
    },
    {
      number: '03',
      title: 'Run the blind draw',
      detail:
        'Matches run on the server so even the host stays surprised. Everyone unseals privately and can ask questions anonymously.',
    },
  ];

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="animate-fade-in space-y-4 border-t border-hairline pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="how-it-works-heading" className="font-display text-2xl font-semibold text-ink">
            How it works
          </h2>
        </div>
        {onStartExchange && (
          <button
            type="button"
            onClick={onStartExchange}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-pine underline-offset-4 hover:underline"
          >
            Create your first exchange
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ol className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
        {steps.map((step) => (
          <li key={step.number} className="px-5 py-4">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-xs text-ink-muted">{step.number}</span>
                <h3 className="font-display text-lg font-semibold text-ink">{step.title}</h3>
              </div>
              <p className="max-w-[65ch] text-sm leading-relaxed text-ink-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ExchangePageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-6"
    >
      <div className="skeleton-shimmer h-4 w-28 rounded" aria-hidden="true" />

      <div className="space-y-4 border-b border-hairline pb-4" aria-hidden="true">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 space-y-2.5">
            <div className="skeleton-shimmer h-8 w-64 max-w-full rounded" />
            <div className="skeleton-shimmer h-4 w-96 max-w-full rounded" />
          </div>
          <div className="skeleton-shimmer h-6 w-24 rounded-full" />
        </div>

        <div className="flex flex-wrap gap-5">
          <div className="skeleton-shimmer h-4 w-32 rounded" />
          <div className="skeleton-shimmer h-4 w-24 rounded" />
          <div className="skeleton-shimmer h-4 w-36 rounded" />
        </div>

        <div className="flex gap-6 pt-2">
          <div className="skeleton-shimmer h-4 w-16 rounded" />
          <div className="skeleton-shimmer h-4 w-24 rounded" />
          <div className="skeleton-shimmer h-4 w-28 rounded" />
        </div>
      </div>

      <div
        className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]"
        aria-hidden="true"
      >
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="skeleton-shimmer h-6 w-52 max-w-full rounded" />
                <div className="skeleton-shimmer h-3.5 w-72 max-w-full rounded" />
              </div>
              <div className="skeleton-shimmer h-10 w-32 rounded-md" />
            </div>
            <div className="flex gap-4 border-t border-hairline pt-3">
              <div className="skeleton-shimmer h-4 w-36 rounded" />
              <div className="skeleton-shimmer h-4 w-28 rounded" />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-6 w-32 rounded" />
              <div className="skeleton-shimmer h-8 w-24 rounded-md" />
            </div>
            <div className="space-y-2.5">
              <div className="skeleton-shimmer h-12 w-full rounded-lg" />
              <div className="skeleton-shimmer h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-6 w-28 rounded" />
              <div className="skeleton-shimmer h-4 w-20 rounded" />
            </div>
            <div className="skeleton-shimmer h-1.5 w-full rounded-full" />
            <ul className="divide-y divide-hairline">
              {[0, 1, 2, 3].map((row) => (
                <li key={row} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="skeleton-shimmer h-7 w-7 rounded-full" />
                    <div className="skeleton-shimmer h-4 w-28 rounded" />
                  </div>
                  <div className="skeleton-shimmer h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <span className="sr-only">Loading exchange details...</span>
    </div>
  );
}

export function AuthCardSkeleton() {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-lg border border-hairline bg-surface"
    >
      <div className="h-0.5 w-full overflow-hidden bg-surface-subtle" aria-hidden="true">
        <div className="animate-progress-bar h-full rounded-full bg-pine/60" />
      </div>
      <div className="space-y-5 p-6 sm:p-7" aria-hidden="true">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-7 w-44 rounded" />
          <div className="skeleton-shimmer h-4 w-64 max-w-full rounded" />
        </div>

        <div className="skeleton-shimmer h-10 w-full rounded-md" />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-hairline" />
          <div className="skeleton-shimmer h-3 w-16 rounded" />
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="skeleton-shimmer h-4 w-24 rounded" />
            <div className="skeleton-shimmer h-9 w-full rounded-md" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton-shimmer h-4 w-20 rounded" />
            <div className="skeleton-shimmer h-9 w-full rounded-md" />
          </div>
          <div className="skeleton-shimmer h-10 w-full rounded-md" />
        </div>
      </div>
      <span className="sr-only">Checking your session...</span>
    </section>
  );
}

export function JoinPageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto max-w-2xl space-y-8"
    >
      <div
        className="overflow-hidden rounded-lg border border-hairline bg-surface"
        aria-hidden="true"
      >
        <div className="h-1 w-full overflow-hidden bg-surface-subtle">
          <div className="animate-progress-bar h-full rounded-full bg-seal/65" />
        </div>
        <div className="space-y-4 p-6 sm:p-7">
          <div className="skeleton-shimmer h-3.5 w-24 rounded" />
          <div className="skeleton-shimmer h-8 w-64 max-w-full rounded" />
          <div className="skeleton-shimmer h-4 w-80 max-w-full rounded" />
          <div className="flex flex-wrap gap-5 border-t border-hairline pt-4">
            <div className="skeleton-shimmer h-4 w-32 rounded" />
            <div className="skeleton-shimmer h-4 w-24 rounded" />
            <div className="skeleton-shimmer h-4 w-28 rounded" />
          </div>
        </div>
      </div>

      <AuthCardSkeleton />
      <span className="sr-only">Loading invitation...</span>
    </div>
  );
}

export interface ExchangeWaitingBannerProps {
  participantsCount: number;
  targetCount: number | null;
  isOrganizer: boolean;
  hasJoined: boolean;
  myDisplayName: string | null;
  myWishlistCount: number;
  canDraw: boolean;
  onJumpToWishlist?: () => void;
  onJumpToDraw?: () => void;
}

export function ExchangeWaitingBanner({
  participantsCount,
  targetCount,
  isOrganizer,
  hasJoined,
  myDisplayName,
  myWishlistCount,
  canDraw,
  onJumpToWishlist,
  onJumpToDraw,
}: ExchangeWaitingBannerProps) {
  const spotsRemaining =
    targetCount !== null
      ? Math.max(0, targetCount - participantsCount)
      : Math.max(0, 3 - participantsCount);

  const headline = !canDraw
    ? targetCount !== null
      ? `Waiting for ${spotsRemaining} more ${spotsRemaining === 1 ? 'participant' : 'participants'} to join`
      : `Waiting for ${spotsRemaining} more ${spotsRemaining === 1 ? 'person' : 'people'} (min 3 to draw)`
    : isOrganizer
      ? 'Group is ready. You can draw names below.'
      : 'Waiting for the host to draw names.';

  const subtitle = !hasJoined
    ? 'Add your wishlist below so your future Anonymous Gifter has gift ideas ready once names are drawn.'
    : !canDraw
      ? targetCount !== null
        ? `${participantsCount} of ${targetCount} spots filled. Share the invite link above while everyone joins.`
        : `${participantsCount} joined so far. At least 3 participants are needed before names can be drawn.`
      : isOrganizer
        ? 'All roster requirements are met. Review exclusions or run the blind draw when your group is set.'
        : 'All spots are ready. Your sealed assignment will appear right here as soon as the host runs the draw.';

  const rosterDone = canDraw;
  const wishlistDone = hasJoined && myWishlistCount > 0;

  return (
    <section
      aria-label="Waiting room status"
      className="animate-fade-in rounded-lg border border-hairline bg-surface px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold text-ink">{headline}</h2>
          <p className="max-w-[65ch] text-sm leading-relaxed text-ink-muted">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onJumpToWishlist && (!hasJoined || myWishlistCount === 0) && (
            <button
              type="button"
              onClick={onJumpToWishlist}
              className="h-9 rounded-md border border-hairline bg-surface-subtle px-3 text-xs font-medium text-ink transition-colors hover:bg-hairline/50"
            >
              {hasJoined ? 'Add gift ideas' : 'Join & add wishlist'}
            </button>
          )}
          {onJumpToDraw && isOrganizer && canDraw && (
            <button
              type="button"
              onClick={onJumpToDraw}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-seal px-3.5 text-xs font-medium text-white transition-colors hover:bg-seal-hover"
            >
              <ShuffleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Go to draw
            </button>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-hairline pt-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          {rosterDone && <CheckIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />}
          <span className={rosterDone ? 'font-medium text-ink' : undefined}>
            Roster:{' '}
            {targetCount !== null
              ? `${participantsCount} of ${targetCount} joined`
              : `${participantsCount} joined (min 3)`}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {wishlistDone && <CheckIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />}
          <span className={wishlistDone ? 'font-medium text-ink' : undefined}>
            Wishlist:{' '}
            {!hasJoined
              ? 'Not joined yet'
              : myWishlistCount > 0
                ? `${myDisplayName ? `${myDisplayName}, ` : ''}${myWishlistCount} ${myWishlistCount === 1 ? 'idea' : 'ideas'}`
                : 'No ideas yet'}
          </span>
        </span>
      </div>
    </section>
  );
}
