import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { CalendarIcon, CheckIcon, UsersIcon } from '../components/Icons';
import {
  AuthCardSkeleton,
  JoinPageSkeleton,
  useDebugLoadingPreview,
} from '../components/LoadingPlaceholders';
import { WishlistForm } from '../components/WishlistForm';
import { useAuth } from '../hooks/useAuth';
import { fetchInvitePreview, joinExchangeByCode, withFreshTokenRetry } from '../lib/api';
import { formatBudget, formatExchangeDate } from '../lib/validation';
import type { InvitePreview } from '../types/database';

export function JoinPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { user, loading: authLoading, getAccessToken } = useAuth();
  const debugPreviewLoading = useDebugLoadingPreview();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const data = await fetchInvitePreview(code);
        if (active) {
          setPreview(data);
        }
      } catch (err) {
        if (active) {
          setPreviewError(err instanceof Error ? err.message : 'Invite code not found.');
        }
      } finally {
        if (active) {
          setLoadingPreview(false);
        }
      }
    };
    if (code.trim()) {
      void load();
    } else {
      setLoadingPreview(false);
      setPreviewError('No invite code provided.');
    }
    return () => {
      active = false;
    };
  }, [code]);

  if (loadingPreview || debugPreviewLoading) {
    return <JoinPageSkeleton />;
  }

  if (previewError || !preview) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-hairline bg-surface p-7">
        <h1 className="font-display text-2xl font-semibold text-ink">Invite not found</h1>
        <p className="text-sm text-ink-muted">
          {previewError ?? 'Double-check your invite link with the exchange organizer.'}
        </p>
        <Link
          to="/"
          className="inline-flex items-center rounded-md border border-hairline bg-surface-subtle px-4 py-2 text-sm font-medium text-ink hover:bg-hairline/60"
        >
          Back home
        </Link>
      </div>
    );
  }

  const targetCount =
    typeof preview.target_participants === 'number' && !Number.isNaN(preview.target_participants)
      ? preview.target_participants
      : null;
  const isClosed = preview.status !== 'open';
  const isFull =
    preview.status === 'open' &&
    targetCount !== null &&
    preview.participant_count >= targetCount;
  const redirectTarget = `/join/${encodeURIComponent(code)}`;
  const spotPercent =
    targetCount !== null && targetCount > 0
      ? Math.min(100, Math.round((preview.participant_count / targetCount) * 100))
      : null;

  const isStepOneDone = Boolean(user);

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-7">
      <header className="relative overflow-hidden rounded-xl border border-hairline bg-surface p-6 sm:p-7 space-y-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-seal via-hairline to-pine"
        />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-seal">
            You&apos;re invited
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            {preview.title}
          </h1>
          {preview.description && (
            <p className="max-w-[65ch] text-sm leading-relaxed text-ink-muted">
              {preview.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-4 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-ink" aria-hidden="true" />
            {formatExchangeDate(preview.exchange_date)}
          </span>
          <span>Budget: {formatBudget(preview.budget_amount, preview.currency)}</span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon className="h-3.5 w-3.5 text-ink" aria-hidden="true" />
            {targetCount !== null
              ? `${preview.participant_count} of ${targetCount} joined`
              : `${preview.participant_count} joined`}
          </span>
        </div>

        {spotPercent !== null && preview.status === 'open' && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-seal' : 'bg-pine'}`}
                style={{ width: `${spotPercent}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {!isClosed && !isFull && (
        <nav aria-label="Join progress" className="grid grid-cols-2 gap-3">
          <div
            aria-current={!isStepOneDone ? 'step' : undefined}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              isStepOneDone
                ? 'border-pine/30 bg-pine/[0.04]'
                : 'border-pine bg-surface'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isStepOneDone
                  ? 'bg-pine text-white'
                  : 'border border-pine bg-pine/10 text-pine'
              }`}
            >
              {isStepOneDone ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : '1'}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">Account</p>
              <p className="truncate text-[11px] text-ink-muted">
                {isStepOneDone ? user?.name || user?.email : 'Sign in or create one'}
              </p>
            </div>
          </div>

          <div
            aria-current={isStepOneDone ? 'step' : undefined}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              isStepOneDone
                ? 'border-pine bg-surface'
                : 'border-hairline bg-surface-subtle/50'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isStepOneDone
                  ? 'border border-pine bg-pine/10 text-pine'
                  : 'border border-hairline bg-surface text-ink-muted'
              }`}
            >
              2
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">Your wishlist</p>
              <p className="truncate text-[11px] text-ink-muted">
                Optional gift ideas &amp; notes
              </p>
            </div>
          </div>
        </nav>
      )}

      {isClosed ? (
        <section className="rounded-xl border border-hairline bg-surface p-6 space-y-4">
          <h2 className="font-display text-xl font-semibold text-ink">
            Names have already been drawn
          </h2>
          <p className="text-sm text-ink-muted">
            This exchange is closed to new sign-ups. If you already joined before the draw, open the exchange page to see your match.
          </p>
          {user ? (
            <Link
              to={`/exchanges/${preview.exchange_id}`}
              className="inline-flex h-10 items-center rounded-md bg-pine px-4 text-sm font-medium text-white hover:bg-pine-hover"
            >
              Open exchange
            </Link>
          ) : (
            <AuthCard
              initialMode="signin"
              redirectPath={`/exchanges/${preview.exchange_id}`}
              heading="Already joined?"
              subheading="Sign in to view your match."
            />
          )}
        </section>
      ) : isFull ? (
        <section className="rounded-xl border border-hairline bg-surface p-6 space-y-4">
          <h2 className="font-display text-xl font-semibold text-ink">
            This exchange is full
          </h2>
          <p className="text-sm text-ink-muted">
            All {targetCount} spots have been claimed. Ask the host to raise the participant limit if you need to join.
          </p>
          {user ? (
            <Link
              to={`/exchanges/${preview.exchange_id}`}
              className="inline-flex h-10 items-center rounded-md bg-pine px-4 text-sm font-medium text-white hover:bg-pine-hover"
            >
              Already joined? Open exchange
            </Link>
          ) : (
            <AuthCard
              initialMode="signin"
              redirectPath={`/exchanges/${preview.exchange_id}`}
              heading="Already joined?"
              subheading="Sign in to open the exchange."
            />
          )}
        </section>
      ) : authLoading ? (
        <AuthCardSkeleton />
      ) : !user ? (
        <AuthCard
          initialMode="signup"
          redirectPath={redirectTarget}
          signupHeading="Create your account to join"
          signupSubheading="Enter your name, email, and password (or continue with Google), then add your wishlist."
          heading="Sign in to join this exchange"
          subheading="Once signed in, you will add your wishlist in one quick step."
        />
      ) : (
        <section className="rounded-xl border border-hairline bg-surface p-6 sm:p-7 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">
              Join this exchange
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Gift ideas are optional if you&apos;re open to surprises. You can update your wishlist anytime on the exchange page.
            </p>
          </div>

          {joinError && (
            <div
              role="alert"
              className="rounded-md border border-seal/30 bg-seal/5 px-4 py-3 text-sm text-seal"
            >
              {joinError}
            </div>
          )}

          <WishlistForm
            initialValues={{
              display_name: user.name ?? '',
              alias: '',
              wishlist_items: [],
              dislikes: '',
              delivery_notes: '',
            }}
            lockDisplayName={Boolean(user.name?.trim())}
            submitLabel="Join exchange"
            submittingLabel="Joining..."
            submitting={joining}
            onSubmit={async (values) => {
              setJoinError(null);
              setJoining(true);
              try {
                const joined = await withFreshTokenRetry(getAccessToken, (token) =>
                  joinExchangeByCode(code, values, token),
                );
                navigate(`/exchanges/${joined.exchange_id}`, { replace: true });
              } catch (err) {
                setJoinError(err instanceof Error ? err.message : 'Unable to join exchange.');
              } finally {
                setJoining(false);
              }
            }}
          />
        </section>
      )}
    </div>
  );
}
