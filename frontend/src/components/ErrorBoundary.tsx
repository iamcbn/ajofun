import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error boundary prevents blank crash screens; avoid leaking internals in UI
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto max-w-lg rounded-xl border border-hairline bg-surface p-7 sm:p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-seal">
          Something went wrong
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          This view ran into an unexpected problem
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Your exchanges and wishlists are safe. Reload this page or return home to continue.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover"
          >
            Reload page
          </button>
          <Link
            to="/"
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex h-10 items-center rounded-md border border-hairline bg-surface-subtle px-4 text-sm font-medium text-ink transition-colors hover:bg-hairline/60"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }
}
