import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '../components/Icons';
import { RevealCard } from '../components/RevealCard';
import { useExchangeOutlet } from './ExchangeLayout';

export function ExchangeMatchPage() {
  const {
    exchange,
    isDrawn,
    myAssignment,
    recipient,
    unsealAssignment,
  } = useExchangeOutlet();

  if (!isDrawn) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-7 space-y-3 sm:p-10">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Names have not been drawn yet
        </h2>
        <p className="max-w-md text-sm text-ink-muted">
          Once the host draws names, your private sealed match will appear here.
        </p>
        <div className="pt-1">
          <Link
            to={`/exchanges/${exchange.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-pine underline-offset-4 hover:underline"
          >
            &larr; Back to Overview
          </Link>
        </div>
      </section>
    );
  }

  if (!myAssignment) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-6 space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">No outgoing match</h2>
        <p className="text-sm text-ink-muted">
          You organized this exchange without joining as a participant, so you do not have an outgoing match.
        </p>
        <div>
          <Link
            to={`/exchanges/${exchange.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-pine underline-offset-4 hover:underline"
          >
            &larr; Back to Overview
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <RevealCard
        assignment={myAssignment}
        recipient={recipient}
        onUnseal={unsealAssignment}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-subtle/45 px-4 py-3 text-xs">
        <span className="text-ink-muted">
          Need a hint on size, color, or delivery?
        </span>
        <Link
          to={`/exchanges/${exchange.id}/qa`}
          className="inline-flex items-center gap-1.5 font-medium text-pine underline-offset-4 hover:underline"
        >
          Ask match in Q&amp;A
          <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
