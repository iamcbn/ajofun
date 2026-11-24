import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <section className="rounded-xl border border-hairline bg-surface p-8 text-center space-y-4">
        <h1 className="font-display text-3xl font-semibold text-ink">Page not found</h1>
        <p className="text-sm text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="pt-1">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-pine px-5 text-sm font-medium text-white transition-colors hover:bg-pine-hover"
          >
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
