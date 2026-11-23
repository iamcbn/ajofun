import { Link } from 'react-router-dom';
import { AnonymousQA } from '../components/AnonymousQA';
import { useExchangeOutlet } from './ExchangeLayout';

export function ExchangeQAPage() {
  const {
    exchange,
    user,
    isDrawn,
    myParticipant,
    myAssignment,
    outgoingMessages,
    incomingAssignmentId,
    incomingMessages,
    liveStatus,
    sendAnonymousMessage,
  } = useExchangeOutlet();

  if (!isDrawn) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-7 space-y-3 sm:p-10">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Anonymous Q&amp;A unlocks once names are drawn
        </h2>
        <p className="max-w-md text-sm text-ink-muted">
          Check back after the blind draw to message your match or reply to your Anonymous Gifter.
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

  if (!myParticipant) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-6 space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">Participant Q&amp;A only</h2>
        <p className="text-sm text-ink-muted">
          You organized this exchange without joining as a participant, so you do not have a Q&amp;A thread.
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
    <AnonymousQA
      key={`${exchange.id}-${user.id}`}
      myAssignmentId={myAssignment?.id ?? null}
      recipientName="your match"
      outgoingMessages={outgoingMessages}
      incomingAssignmentId={incomingAssignmentId}
      incomingMessages={incomingMessages}
      senderIdentity={{
        displayName: myParticipant.display_name,
        alias: myParticipant.alias,
        email: user.email,
        accountName: user.name,
      }}
      liveStatus={liveStatus}
      hasUnsealedMatch={Boolean(myAssignment?.revealed_at)}
      matchPath={`/exchanges/${exchange.id}/match`}
      onSendMessage={sendAnonymousMessage}
    />
  );
}
