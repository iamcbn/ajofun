import { useEffect, useMemo } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { AddToCalendarMenu } from '../components/AddToCalendarMenu';
import {
  CalendarIcon,
  SpinnerIcon,
  UsersIcon,
} from '../components/Icons';
import { ExchangePageSkeleton, useDebugLoadingPreview } from '../components/LoadingPlaceholders';
import { useAuth } from '../hooks/useAuth';
import { useExchange, type LiveConnectionStatus, type WishlistUpdateInput } from '../hooks/useExchange';
import { formatBudget, formatExchangeDate } from '../lib/validation';
import type {
  AnonymousMessage,
  AnonymousSenderRole,
  Assignment,
  Exchange,
  Exclusion,
  Participant,
  UserProfile,
} from '../types/database';

export interface ExchangeOutletContext {
  exchange: Exchange;
  participants: Participant[];
  exclusions: Exclusion[];
  myParticipant: Participant | null;
  myAssignment: Assignment | null;
  recipient: Participant | null;
  outgoingMessages: AnonymousMessage[];
  incomingMessages: AnonymousMessage[];
  incomingAssignmentId: string | null;
  refreshing: boolean;
  liveStatus: LiveConnectionStatus;
  user: UserProfile;
  isOrganizer: boolean;
  isDrawn: boolean;
  targetCount: number | null;
  isFull: boolean;
  spotsRemaining: number;
  canDraw: boolean;
  inviteUrl: string;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  reload: () => Promise<void>;
  updateMyWishlist: (input: WishlistUpdateInput) => Promise<void>;
  updateTargetParticipants: (target: number | null) => Promise<void>;
  addExclusion: (
    giverParticipantId: string,
    excludedParticipantId: string,
    mutual: boolean,
  ) => Promise<void>;
  removeExclusion: (exclusionId: string) => Promise<void>;
  unsealAssignment: () => Promise<void>;
  sendAnonymousMessage: (
    assignmentId: string,
    senderRole: AnonymousSenderRole,
    body: string,
  ) => Promise<void>;
}

export function useExchangeOutlet(): ExchangeOutletContext {
  return useOutletContext<ExchangeOutletContext>();
}

export function ExchangeLayout() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, getAccessToken } = useAuth();
  const debugPreviewLoading = useDebugLoadingPreview();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    exchange,
    participants,
    exclusions,
    myParticipant,
    myAssignment,
    recipient,
    outgoingMessages,
    incomingMessages,
    incomingAssignmentId,
    loading,
    refreshing,
    error,
    liveStatus,
    reload,
    updateMyWishlist,
    updateTargetParticipants,
    addExclusion,
    removeExclusion,
    unsealAssignment,
    sendAnonymousMessage,
  } = useExchange(id);

  useEffect(() => {
    if (!authLoading && !user && id) {
      navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [authLoading, id, location.pathname, navigate, user]);

  const isOrganizer = Boolean(exchange && user && exchange.organizer_id === user.id);
  const isDrawn = exchange?.status === 'drawn' || exchange?.status === 'completed';
  const targetCount =
    exchange &&
    typeof exchange.target_participants === 'number' &&
    !Number.isNaN(exchange.target_participants)
      ? exchange.target_participants
      : null;
  const isFull = targetCount !== null && participants.length >= targetCount;
  const spotsRemaining = targetCount !== null ? Math.max(0, targetCount - participants.length) : 0;
  const canDraw = targetCount !== null ? participants.length === targetCount : participants.length >= 3;
  const inviteUrl = exchange ? `${window.location.origin}/join/${exchange.invite_code}` : '';
  const exchangeUrl = exchange ? `${window.location.origin}/exchanges/${exchange.id}` : '';

  const outletContext = useMemo<ExchangeOutletContext | null>(() => {
    if (!exchange || !user) return null;
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
      refreshing,
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
      unsealAssignment,
      sendAnonymousMessage,
    };
  }, [
    addExclusion,
    canDraw,
    exchange,
    exclusions,
    getAccessToken,
    incomingAssignmentId,
    incomingMessages,
    inviteUrl,
    isDrawn,
    isFull,
    isOrganizer,
    liveStatus,
    myAssignment,
    myParticipant,
    outgoingMessages,
    participants,
    recipient,
    refreshing,
    reload,
    removeExclusion,
    sendAnonymousMessage,
    spotsRemaining,
    targetCount,
    unsealAssignment,
    updateMyWishlist,
    updateTargetParticipants,
    user,
  ]);

  if (loading || authLoading || debugPreviewLoading) {
    return <ExchangePageSkeleton />;
  }

  if (error || !exchange || !user || !outletContext) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-hairline bg-surface p-7">
        <h1 className="font-display text-2xl font-semibold text-ink">Unable to open exchange</h1>
        <p className="text-sm text-ink-muted">
          {error ?? 'You do not have permission to view this exchange.'}
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

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-all whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ${
      isActive
        ? 'bg-surface font-semibold text-ink shadow-sm border border-hairline'
        : 'border border-transparent text-ink-muted hover:text-ink'
    }`;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        >
          &larr; All exchanges
        </Link>

        <nav
          aria-label="Exchange sections"
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-hairline bg-surface-subtle/80 p-1"
        >
          <NavLink to={`/exchanges/${exchange.id}`} end className={tabClass}>
            <span>Overview</span>
          </NavLink>

          <NavLink to={`/exchanges/${exchange.id}/match`} className={tabClass}>
            <span>Secret Match</span>
            {isDrawn && myAssignment && !myAssignment.revealed_at && (
              <span className="rounded-full bg-seal/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-seal sm:px-2 sm:text-[10px]">
                Sealed
              </span>
            )}
          </NavLink>

          <NavLink to={`/exchanges/${exchange.id}/qa`} className={tabClass}>
            <span>
              <span className="sr-only sm:not-sr-only">Anonymous </span>Q&amp;A
            </span>
            {isDrawn && liveStatus === 'live' && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-pine"
                aria-label="Live connected"
                title="Live connected"
              />
            )}
            {isDrawn && incomingMessages.length > 0 && (
              <span className="rounded-full bg-pine/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-pine sm:px-2 sm:text-[10px]">
                {incomingMessages.length}
              </span>
            )}
          </NavLink>
        </nav>
      </div>

      <header className="relative overflow-hidden rounded-2xl border border-hairline bg-surface p-5 sm:p-6 space-y-4">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
            isDrawn ? 'bg-seal' : 'bg-pine'
          }`}
        />
        {refreshing && (
          <div
            aria-hidden="true"
            className="h-0.5 w-full overflow-hidden rounded-full bg-surface-subtle"
          >
            <div className="animate-progress-bar h-full rounded-full bg-pine/75" />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
              {exchange.title}
            </h1>
            {exchange.description && (
              <p className="max-w-[65ch] text-sm leading-relaxed text-ink-muted">
                {exchange.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {refreshing && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted"
              >
                <SpinnerIcon className="h-3 w-3" aria-hidden="true" />
                Syncing...
              </span>
            )}
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isDrawn ? 'bg-seal/10 text-seal' : 'bg-pine/10 text-pine'
              }`}
            >
              {isDrawn ? 'Names drawn' : 'Open'}
            </span>
          </div>
        </div>

        <div className="grid gap-2.5 border-t border-hairline pt-4 text-xs text-ink-muted sm:grid-cols-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle/60 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <CalendarIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
              {formatExchangeDate(exchange.exchange_date)}
            </span>
            {exchange.exchange_date && (
              <AddToCalendarMenu
                event={{
                  id: exchange.id,
                  title: exchange.title,
                  exchangeDate: exchange.exchange_date,
                  description: exchange.description,
                  budgetAmount: exchange.budget_amount,
                  currency: exchange.currency,
                  exchangeUrl,
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-surface-subtle/60 px-3 py-2">
            <span>Budget:</span>
            <strong className="font-medium text-ink">
              {formatBudget(exchange.budget_amount, exchange.currency)}
            </strong>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-surface-subtle/60 px-3 py-2">
            <UsersIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
            <span className="font-medium text-ink">
              {targetCount !== null
                ? `${participants.length} of ${targetCount} participants`
                : `${participants.length} ${participants.length === 1 ? 'participant' : 'participants'}`}
            </span>
          </div>
        </div>
      </header>

      <Outlet context={outletContext} />
    </div>
  );
}
