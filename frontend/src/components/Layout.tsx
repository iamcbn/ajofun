import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOutIcon } from './Icons';
import { HeaderSessionSkeleton, useDebugLoadingPreview } from './LoadingPlaceholders';
import { LocalDebugBar } from './LocalDebugBar';
import { useAuth } from '../hooks/useAuth';
import { isNeonConfigured } from '../lib/neon';

export function Layout({ children }: { children: ReactNode }) {
  const { user, loading, authError, clearAuthError, signOut } = useAuth();
  const debugPreviewLoading = useDebugLoadingPreview();
  const location = useLocation();

  const userLabel = user?.name || user?.email || '';
  const userInitial = userLabel.trim().charAt(0).toUpperCase() || '?';

  const showNav = loading || debugPreviewLoading || Boolean(user) || location.pathname !== '/auth';

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-pine focus:px-3.5 focus:py-2 focus:text-xs focus:font-medium focus:text-white focus:shadow-sm"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur-md">
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-pine via-hairline to-seal"
        />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-ink hover:opacity-80"
            >
              <img
                src="/favicon.svg"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 rounded-lg border border-hairline"
              />
              <span className="font-display text-lg font-semibold tracking-tight">
                Àjọfún
              </span>
            </Link>
          </div>

          {showNav && (
            <nav aria-label="Account navigation" className="flex items-center gap-2.5">
              {loading || debugPreviewLoading ? (
                <HeaderSessionSkeleton />
              ) : user ? (
                <>
                  <div className="hidden items-center gap-2 rounded-full border border-hairline bg-surface-subtle/70 py-1 pl-1.5 pr-3 sm:inline-flex">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-pine text-[11px] font-semibold text-white"
                    >
                      {userInitial}
                    </span>
                    <span className="text-xs font-medium text-ink">
                      {userLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  >
                    <LogOutIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
                  className="inline-flex items-center rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                >
                  Sign in
                </Link>
              )}
            </nav>
          )}
        </div>
      </header>

      {authError && (
        <div
          role="alert"
          className="border-b border-seal/25 bg-seal/5 px-4 py-2.5 text-xs text-seal"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:px-2">
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              className="shrink-0 rounded border border-seal/30 bg-surface px-2.5 py-1 text-[11px] font-medium text-seal hover:bg-seal/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!isNeonConfigured && (
        <div
          role="status"
          className="border-b border-seal/25 bg-surface-subtle px-4 py-2.5 text-center text-xs text-ink"
        >
          Neon environment variables are not set yet. Copy{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono">
            frontend/.env.example
          </code>{' '}
          to{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono">
            frontend/.env
          </code>{' '}
          with your Neon Auth and Data API URLs to enable sign-in and database persistence.
        </div>
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className={`mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-10 ${
          __LOCAL_DEBUG__ ? 'pb-24 sm:pb-24' : ''
        }`}
      >
        {children}
      </main>

      <footer className="border-t border-hairline py-6 text-center text-xs text-ink-muted">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 sm:px-6">
          <span>&copy; 2026 Àjọfún</span>
          <span aria-hidden="true">&middot;</span>
          <Link to="/privacy" className="underline-offset-2 hover:text-ink hover:underline">
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link to="/terms" className="underline-offset-2 hover:text-ink hover:underline">
            Terms of Use
          </Link>
        </div>
      </footer>

      {__LOCAL_DEBUG__ && <LocalDebugBar />}
    </div>
  );
}
