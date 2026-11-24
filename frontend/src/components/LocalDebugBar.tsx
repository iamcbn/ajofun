import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ChevronUpIcon, RotateCcwIcon, SpinnerIcon } from './Icons';
import {
  getLocalDebugSnapshot,
  resetLocalDebugStore,
  setDebugLoadingPreview,
  subscribeLocalDebug,
  switchDebugUser,
  type LocalDebugSnapshot,
} from '../lib/localDebugStore';

const PERSONA_BADGES: Record<string, string> = {
  'user-alex': 'Host',
  'user-casey': 'Unjoined',
};

export function LocalDebugBar() {
  const [snapshot, setSnapshot] = useState<LocalDebugSnapshot>(() => getLocalDebugSnapshot());
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const sync = () => setSnapshot(getLocalDebugSnapshot());
    sync();
    return subscribeLocalDebug(sync);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.scrollPaddingBottom = collapsed ? '' : '5.5rem';
    return () => {
      document.documentElement.style.scrollPaddingBottom = '';
    };
  }, [collapsed]);

  const currentUser = snapshot.users.find((u) => u.id === snapshot.currentUserId) ?? null;
  const portSuffix =
    typeof window !== 'undefined' && window.location.port ? ` (:${window.location.port})` : '';

  if (collapsed) {
    return (
      <div className="sticky bottom-3 z-40 ml-auto mr-3 mb-3 w-fit max-w-[calc(100vw-1.5rem)] sm:mr-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-label="Expand local debug bar"
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-xs font-medium text-ink shadow-sm hover:bg-surface-subtle"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-pine" aria-hidden="true" />
          <span className="truncate">
            Debug{portSuffix} · {currentUser?.name || currentUser?.email || 'Guest'}
          </span>
          <ChevronUpIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const openExchange =
    snapshot.exchanges.find((ex) => ex.id === 'ex-open-winter') ??
    snapshot.exchanges.find((ex) => ex.status === 'open') ??
    null;
  const drawnExchange =
    snapshot.exchanges.find((ex) => ex.id === 'ex-drawn-cozy') ??
    snapshot.exchanges.find((ex) => ex.status !== 'open') ??
    null;

  const linkClass = (path: string) => {
    const isActive =
      location.pathname === path ||
      (path.startsWith('/exchanges/') && location.pathname.startsWith(`${path}/`));
    return `rounded border px-2 py-1 text-xs font-medium transition-colors ${
      isActive
        ? 'border-pine bg-pine/10 text-pine'
        : 'border-hairline bg-surface-subtle/60 text-ink hover:bg-surface-subtle'
    }`;
  };

  const handleReset = () => {
    resetLocalDebugStore();
    if (location.pathname.startsWith('/exchanges/')) {
      const targetId = location.pathname.replace('/exchanges/', '').split('/')[0];
      const fresh = getLocalDebugSnapshot();
      if (!fresh.exchanges.some((ex) => ex.id === targetId)) {
        navigate('/', { replace: true });
      }
    }
  };

  return (
    <aside
      aria-label="Local debug controls"
      className="sticky bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur-sm shadow-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pine/10 px-2.5 py-1 text-[11px] font-semibold text-pine">
            <span className="h-1.5 w-1.5 rounded-full bg-pine" aria-hidden="true" />
            Local Debug{portSuffix} · Offline (No Neon)
          </span>

          <div className="flex items-center gap-1.5">
            <label htmlFor="debug-persona-select" className="text-xs font-medium text-ink-muted">
              Persona:
            </label>
            <select
              id="debug-persona-select"
              value={snapshot.currentUserId ?? ''}
              onChange={(e) => {
                const next = e.target.value;
                switchDebugUser(next ? next : null);
              }}
              className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink"
            >
              {snapshot.users.map((persona) => {
                const tag = PERSONA_BADGES[persona.id];
                const label = persona.name || persona.email;
                return (
                  <option key={persona.id} value={persona.id}>
                    {tag ? `${label} (${tag})` : label}
                  </option>
                );
              })}
              <option value="">Signed out (Guest)</option>
            </select>
          </div>
        </div>

        <nav aria-label="Debug quick navigation" className="flex flex-wrap items-center gap-1.5">
          <Link to="/" className={linkClass('/')}>
            Home
          </Link>
          {openExchange && (
            <Link
              to={`/exchanges/${openExchange.id}`}
              className={linkClass(`/exchanges/${openExchange.id}`)}
            >
              Open Swap
            </Link>
          )}
          {drawnExchange && (
            <Link
              to={`/exchanges/${drawnExchange.id}`}
              className={linkClass(`/exchanges/${drawnExchange.id}`)}
            >
              Drawn Swap
            </Link>
          )}
          {openExchange && (
            <Link
              to={`/join/${openExchange.invite_code}`}
              className={linkClass(`/join/${openExchange.invite_code}`)}
            >
              Join {openExchange.invite_code}
            </Link>
          )}
          {drawnExchange && (
            <Link
              to={`/join/${drawnExchange.invite_code}`}
              className={linkClass(`/join/${drawnExchange.invite_code}`)}
            >
              Join {drawnExchange.invite_code}
            </Link>
          )}
          <Link to="/auth" className={linkClass('/auth')}>
            Auth
          </Link>

          <button
            type="button"
            onClick={() => setDebugLoadingPreview(!snapshot.simulateLoading)}
            aria-pressed={Boolean(snapshot.simulateLoading)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              snapshot.simulateLoading
                ? 'border-pine bg-pine text-white hover:bg-pine-hover'
                : 'border-hairline bg-surface text-ink hover:bg-surface-subtle'
            }`}
          >
            {snapshot.simulateLoading && <SpinnerIcon className="h-3 w-3" aria-hidden="true" />}
            Preview Loading
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded border border-seal/30 bg-seal/5 px-2.5 py-1 text-xs font-medium text-seal hover:bg-seal/10"
          >
            <RotateCcwIcon className="h-3 w-3" aria-hidden="true" />
            Reset data
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-expanded={true}
            aria-label="Collapse local debug bar"
            className="rounded border border-hairline bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-subtle hover:text-ink"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </aside>
  );
}
