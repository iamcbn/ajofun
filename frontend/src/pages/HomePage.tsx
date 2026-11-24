import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateExchangeModal } from '../components/CreateExchangeModal';
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  SpinnerIcon,
} from '../components/Icons';
import {
  ExchangeListSkeleton,
  HomeHowItWorksSection,
  useDebugLoadingPreview,
} from '../components/LoadingPlaceholders';
import { HowItWorksStageshow } from '../components/stageshow/HowItWorksStageshow';
import { useAuth } from '../hooks/useAuth';
import { isNeonConfigured, neonDataApi } from '../lib/neon';
import { formatBudget, formatExchangeDate } from '../lib/validation';
import type { Assignment, Exchange } from '../types/database';

export function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const debugPreviewLoading = useDebugLoadingPreview();
  const navigate = useNavigate();

  const [inviteCode, setInviteCode] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(true);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState<boolean>(isNeonConfigured);
  const [fetchedForUserId, setFetchedForUserId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadExchanges = useCallback(async () => {
    if (!user || !isNeonConfigured) {
      setExchanges([]);
      setMyAssignments([]);
      setFetchedForUserId(null);
      setLoadingExchanges(false);
      return;
    }
    setLoadingExchanges(true);
    setListError(null);
    try {
      const [rows, assignmentRows] = await Promise.all([
        neonDataApi.select<Exchange>('exchanges', {
          order: 'created_at.desc',
        }),
        neonDataApi
          .select<Assignment>('assignments', {
            eq: { giver_id: user.id },
          })
          .catch(() => [] as Assignment[]),
      ]);
      setExchanges(rows);
      setMyAssignments(assignmentRows);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load your exchanges.');
    } finally {
      setFetchedForUserId(user.id);
      setLoadingExchanges(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      void loadExchanges();
    }
  }, [authLoading, loadExchanges]);

  const handleStartExchange = () => {
    if (!user) {
      navigate('/auth?redirect=/');
      return;
    }
    setModalOpen(true);
  };

  const handleJoinSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = inviteCode.trim().toUpperCase();
    if (!cleaned) return;
    navigate(`/join/${encodeURIComponent(cleaned)}`);
  };

  const assignmentByExchange = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of myAssignments) {
      map.set(a.exchange_id, a);
    }
    return map;
  }, [myAssignments]);

  const { attentionExchanges, otherExchanges } = useMemo(() => {
    const attention: Exchange[] = [];
    const rest: Exchange[] = [];
    for (const ex of exchanges) {
      const assignment = assignmentByExchange.get(ex.id);
      const isDrawn = ex.status === 'drawn' || ex.status === 'completed';
      const needsUnseal = isDrawn && Boolean(assignment && !assignment.revealed_at);
      if (!isDrawn || needsUnseal) {
        attention.push(ex);
      } else {
        rest.push(ex);
      }
    }
    return { attentionExchanges: attention, otherExchanges: rest };
  }, [assignmentByExchange, exchanges]);

  const isPendingUserFetch = Boolean(user) && isNeonConfigured && fetchedForUserId !== user?.id;
  const isExchangesLoading =
    authLoading || loadingExchanges || debugPreviewLoading || isPendingUserFetch;
  const showYourExchanges = authLoading || Boolean(user) || debugPreviewLoading;
  const showStageshowHero = !showYourExchanges || showHowItWorks;

  const renderExchangeCard = (ex: Exchange) => {
    const isHost = ex.organizer_id === user?.id;
    const isDrawn = ex.status === 'drawn' || ex.status === 'completed';
    const assignment = assignmentByExchange.get(ex.id);
    const needsUnseal = isDrawn && Boolean(assignment && !assignment.revealed_at);
    const destination = needsUnseal ? `/exchanges/${ex.id}/match` : `/exchanges/${ex.id}`;

    return (
      <li key={ex.id} className="flex">
        <Link
          to={destination}
          className="group relative flex w-full flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-hairline bg-surface p-5 transition-all hover:border-pine/50 hover:shadow-sm"
        >
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
              needsUnseal ? 'bg-seal' : isDrawn ? 'bg-seal/50' : 'bg-pine'
            }`}
          />

          <div className="space-y-3 pt-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {needsUnseal ? (
                  <span className="rounded-full bg-seal px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    Unseal match
                  </span>
                ) : (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isDrawn ? 'bg-seal/10 text-seal' : 'bg-pine/10 text-pine'
                    }`}
                  >
                    {isDrawn ? 'Names drawn' : 'Open for sign-ups'}
                  </span>
                )}
                {isHost && (
                  <span className="rounded-full border border-hairline bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                    Host
                  </span>
                )}
              </div>
              <ArrowRightIcon
                className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                aria-hidden="true"
              />
            </div>

            <div>
              <span className="font-display text-xl font-semibold text-ink group-hover:text-pine transition-colors">
                {ex.title}
              </span>
              {ex.description && (
                <p className="mt-1 line-clamp-1 text-xs text-ink-muted">
                  {ex.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-ink" aria-hidden="true" />
              {formatExchangeDate(ex.exchange_date)}
            </span>
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-surface-subtle px-2 py-0.5 font-medium text-ink">
                {formatBudget(ex.budget_amount, ex.currency)}
              </span>
              {ex.target_participants !== null && (
                <span>{ex.target_participants} spots max</span>
              )}
            </div>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-10">
      <section
        className={`relative overflow-hidden rounded-2xl border border-hairline bg-surface p-6 sm:p-8 ${
          showStageshowHero
            ? 'grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10'
            : ''
        }`}
      >
        <div className="space-y-5">
          <h1 className="font-display text-3xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl">
            Host a gift exchange without spoiling the surprise.
          </h1>
          <p className="max-w-[58ch] text-base leading-relaxed text-ink-muted">
            Create a private exchange for your team, friends, or family, share one invite link,
            and draw names blindly so even the host stays surprised.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleStartExchange}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-pine px-5 text-sm font-medium text-white shadow-sm transition-all hover:bg-pine-hover active:scale-[0.99]"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Start an Exchange
            </button>

            <form
              onSubmit={handleJoinSubmit}
              className="flex w-full items-center gap-2 sm:w-auto sm:min-w-[270px]"
            >
              <label htmlFor="home-invite-code" className="sr-only">
                Invite code
              </label>
              <input
                id="home-invite-code"
                type="text"
                maxLength={32}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Have an invite code?"
                className="h-11 min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3.5 text-sm text-ink placeholder:text-[#6B6660] sm:w-48"
              />
              <button
                type="submit"
                disabled={!inviteCode.trim()}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface-subtle px-4 text-sm font-medium text-ink transition-colors hover:bg-hairline/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Join
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>

          {showYourExchanges && !authLoading && user && (
            <div className="pt-1">
              <button
                type="button"
                aria-expanded={showHowItWorks}
                onClick={() => setShowHowItWorks((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-pine underline-offset-4 hover:underline"
              >
                <span>{showHowItWorks ? 'Hide walkthrough' : 'See how it works'}</span>
                {showHowItWorks ? (
                  <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>

        {showStageshowHero && (
          <div className="min-w-0">
            <HowItWorksStageshow />
          </div>
        )}
      </section>

      {showYourExchanges ? (
        <section
          aria-labelledby="your-exchanges-heading"
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="your-exchanges-heading" className="font-display text-2xl font-semibold text-ink">
              Your exchanges
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
              {isExchangesLoading ? (
                <>
                  <SpinnerIcon className="h-3 w-3" aria-hidden="true" />
                  Loading...
                </>
              ) : (
                `${exchanges.length} total`
              )}
            </span>
          </div>

          {!debugPreviewLoading && listError && (
            <div
              role="alert"
              className="rounded-md border border-seal/30 bg-seal/5 px-4 py-3 text-sm text-seal"
            >
              {listError}
            </div>
          )}

          {isExchangesLoading ? (
            <ExchangeListSkeleton />
          ) : !listError && user && exchanges.length === 0 ? (
            <div className="animate-fade-in rounded-xl border border-hairline bg-surface px-6 py-10 text-center space-y-3">
              <p className="mx-auto max-w-md text-sm text-ink-muted">
                You haven&apos;t created or joined an exchange yet.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover"
              >
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                Start an exchange
              </button>
            </div>
          ) : (
            user &&
            exchanges.length > 0 && (
              <div className="animate-fade-in space-y-6">
                {attentionExchanges.length > 0 && otherExchanges.length > 0 ? (
                  <>
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        Active &amp; action needed
                      </h3>
                      <ul className="grid gap-4 md:grid-cols-2">
                        {attentionExchanges.map(renderExchangeCard)}
                      </ul>
                    </div>
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        Drawn exchanges
                      </h3>
                      <ul className="grid gap-4 md:grid-cols-2">
                        {otherExchanges.map(renderExchangeCard)}
                      </ul>
                    </div>
                  </>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2">{exchanges.map(renderExchangeCard)}</ul>
                )}
              </div>
            )
          )}
        </section>
      ) : (
        <HomeHowItWorksSection onStartExchange={handleStartExchange} />
      )}

      <CreateExchangeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(exchangeId) => {
          setModalOpen(false);
          navigate(`/exchanges/${exchangeId}`);
        }}
      />
    </div>
  );
}
