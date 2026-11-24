import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import type { LiveConnectionStatus } from '../hooks/useExchange';
import { detectIdentityLeak, type SenderIdentityContext } from '../lib/validation';
import type { AnonymousMessage, AnonymousSenderRole } from '../types/database';
import { SendIcon, ShieldAlertIcon, SpinnerIcon } from './Icons';

interface AnonymousQAProps {
  myAssignmentId: string | null;
  recipientName: string;
  outgoingMessages: AnonymousMessage[];
  incomingAssignmentId: string | null;
  incomingMessages: AnonymousMessage[];
  senderIdentity: SenderIdentityContext;
  liveStatus: LiveConnectionStatus;
  hasUnsealedMatch: boolean;
  matchPath?: string;
  readOnly?: boolean;
  onSendMessage: (
    assignmentId: string,
    senderRole: AnonymousSenderRole,
    body: string,
  ) => Promise<void>;
}

function formatSendError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Could not send right now. Try again.';
  }
  const msg = err.message.trim();
  if (!msg || msg.toLowerCase() === 'failed to fetch' || msg.toLowerCase().includes('networkerror')) {
    return 'Could not send right now. Check your connection and try again.';
  }
  return msg;
}

function formatMessageTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AnonymousQA({
  myAssignmentId,
  recipientName,
  outgoingMessages,
  incomingAssignmentId,
  incomingMessages,
  senderIdentity,
  liveStatus,
  hasUnsealedMatch,
  matchPath,
  readOnly = false,
  onSendMessage,
}: AnonymousQAProps) {
  const [activeTab, setActiveTab] = useState<'ask' | 'inbox'>('ask');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadListRef = useRef<HTMLUListElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const askTabRef = useRef<HTMLButtonElement>(null);
  const inboxTabRef = useRef<HTMLButtonElement>(null);

  const currentAssignmentId = activeTab === 'ask' ? myAssignmentId : incomingAssignmentId;
  const currentRole: AnonymousSenderRole = activeTab === 'ask' ? 'santa' : 'recipient';
  const currentThread = activeTab === 'ask' ? outgoingMessages : incomingMessages;

  const identityCheck = useMemo(
    () => detectIdentityLeak(draft, senderIdentity),
    [draft, senderIdentity],
  );

  useEffect(() => {
    const listEl = threadListRef.current;
    if (!listEl) return;
    listEl.scrollTop = listEl.scrollHeight;
  }, [activeTab, currentThread.length]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const selectTab = (next: 'ask' | 'inbox', moveFocus = false) => {
    setActiveTab(next);
    setError(null);
    if (moveFocus) {
      window.requestAnimationFrame(() => {
        (next === 'ask' ? askTabRef.current : inboxTabRef.current)?.focus();
      });
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      selectTab(activeTab === 'ask' ? 'inbox' : 'ask', true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectTab('ask', true);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectTab('inbox', true);
    }
  };

  const submitMessage = async () => {
    if (readOnly || !currentAssignmentId || sending) return;
    const cleanBody = draft.trim();
    if (!cleanBody || identityCheck.blocked) return;

    setError(null);
    setSending(true);
    try {
      await onSendMessage(currentAssignmentId, currentRole, cleanBody);
      setDraft('');
    } catch (sendErr) {
      setError(formatSendError(sendErr));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const activeAlertMessage = identityCheck.blocked ? identityCheck.reason : error;

  return (
    <section className="rounded-xl border border-hairline bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">
            Anonymous Q&amp;A
          </h2>
          {liveStatus === 'live' && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/25"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
          {liveStatus === 'polling' && (
            <span
              role="status"
              aria-live="polite"
              className="text-xs text-ink-muted"
            >
              Auto-updating
            </span>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Anonymous message threads"
          onKeyDown={handleTabKeyDown}
          className="grid w-full grid-cols-2 rounded-lg border border-hairline bg-surface-subtle p-1 sm:inline-flex sm:w-auto"
        >
          <button
            ref={askTabRef}
            type="button"
            role="tab"
            id="tab-ask"
            aria-selected={activeTab === 'ask'}
            aria-controls="panel-qa"
            tabIndex={activeTab === 'ask' ? 0 : -1}
            onClick={() => selectTab('ask')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'ask'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>To your match</span>
            {outgoingMessages.length > 0 && (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-ink-muted">
                {outgoingMessages.length}
              </span>
            )}
          </button>
          <button
            ref={inboxTabRef}
            type="button"
            role="tab"
            id="tab-inbox"
            aria-selected={activeTab === 'inbox'}
            aria-controls="panel-qa"
            tabIndex={activeTab === 'inbox' ? 0 : -1}
            onClick={() => selectTab('inbox')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'inbox'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>From your Gifter</span>
            {incomingMessages.length > 0 && (
              <span className="rounded-full bg-pine/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-pine">
                {incomingMessages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div
        id="panel-qa"
        role="tabpanel"
        aria-labelledby={activeTab === 'ask' ? 'tab-ask' : 'tab-inbox'}
        className="mt-5 space-y-4"
      >
        {activeTab === 'ask' && !hasUnsealedMatch && matchPath && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-subtle/60 px-3.5 py-2.5 text-xs text-ink-muted">
            <span>Your match is still sealed.</span>
            <Link
              to={matchPath}
              className="shrink-0 font-medium text-pine underline-offset-2 hover:underline"
            >
              Open Secret Match &rarr;
            </Link>
          </div>
        )}

        {currentThread.length === 0 && !sending ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm text-ink-muted">
              {activeTab === 'ask'
                ? 'No messages yet.'
                : 'Nothing from your Anonymous Gifter yet.'}
            </p>
          </div>
        ) : (
          <ul ref={threadListRef} className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {currentThread.map((msg) => {
              const isOwnMessage =
                (activeTab === 'ask' && msg.sender_role === 'santa') ||
                (activeTab === 'inbox' && msg.sender_role === 'recipient');
              const senderLabel =
                msg.sender_role === 'santa'
                  ? activeTab === 'ask'
                    ? 'You (Anonymous Gifter)'
                    : 'Your Anonymous Gifter'
                  : activeTab === 'ask'
                    ? recipientName
                    : 'You';
              const timeLabel = formatMessageTime(msg.created_at);

              return (
                <li
                  key={msg.id}
                  className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm sm:max-w-[80%] ${
                      isOwnMessage
                        ? 'bg-pine text-white'
                        : 'border border-hairline bg-surface-subtle text-ink'
                    }`}
                  >
                    <div
                      className={`flex items-baseline justify-between gap-3 text-[11px] font-medium ${
                        isOwnMessage ? 'text-white/85' : 'text-ink-muted'
                      }`}
                    >
                      <span>{senderLabel}</span>
                      {timeLabel && <span className="tabular-nums">{timeLabel}</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.body}
                    </p>
                  </div>
                </li>
              );
            })}

            {sending && draft.trim() && (
              <li aria-live="polite" className="animate-fade-in flex flex-col items-end">
                <div className="max-w-[88%] rounded-xl bg-pine/85 px-3.5 py-2.5 text-sm text-white sm:max-w-[80%]">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/90">
                    <SpinnerIcon className="h-3 w-3" aria-hidden="true" />
                    Sending...
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
                    {draft.trim()}
                  </p>
                </div>
              </li>
            )}
          </ul>
        )}

        {activeAlertMessage && (
          <div
            id="qa-composer-alert"
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-seal/35 bg-seal/5 px-3.5 py-2.5 text-xs text-seal"
          >
            <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{activeAlertMessage}</span>
          </div>
        )}

        {readOnly ? (
          <p className="rounded-md bg-surface-subtle px-3.5 py-2.5 text-xs text-ink-muted">
            This exchange is completed. Anonymous Q&amp;A is read-only.
          </p>
        ) : currentAssignmentId ? (
          <div className="space-y-1.5 border-t border-hairline pt-3.5">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <label htmlFor="anon-message-input" className="sr-only">
                Write a message
              </label>
              <textarea
                ref={composerRef}
                id="anon-message-input"
                rows={1}
                maxLength={1000}
                disabled={sending}
                aria-invalid={identityCheck.blocked || Boolean(error)}
                aria-describedby={activeAlertMessage ? 'qa-composer-alert' : undefined}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  activeTab === 'ask'
                    ? 'Ask your match a question...'
                    : 'Reply to your Anonymous Gifter...'
                }
                className={`min-h-[40px] max-h-32 min-w-0 flex-1 resize-none rounded-md border bg-surface px-3 py-2 text-sm leading-snug text-ink placeholder:text-[#6B6660] disabled:opacity-70 ${
                  identityCheck.blocked ? 'border-seal focus-visible:outline-seal' : 'border-hairline'
                }`}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim() || identityCheck.blocked}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <SpinnerIcon className="h-4 w-4" aria-hidden="true" />
                    Sending...
                  </>
                ) : (
                  <>
                    <SendIcon className="h-4 w-4" aria-hidden="true" />
                    Send
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          activeTab === 'inbox' &&
          !incomingAssignmentId && (
            <p className="rounded-md bg-surface-subtle px-3.5 py-2.5 text-xs text-ink-muted">
              You can reply here once your Anonymous Gifter sends the first message.
            </p>
          )
        )}
      </div>
    </section>
  );
}
