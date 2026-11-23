import { useEffect, useMemo, useRef, useState } from 'react';
import { buildInviteShareMessage } from '../lib/inviteShare';
import type { Exchange } from '../types/database';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  ShareIcon,
} from './Icons';

interface InviteShareCardProps {
  exchange: Exchange;
  inviteUrl: string;
  isFull: boolean;
  participantsCount: number;
  targetCount: number | null;
  compactHeader?: boolean;
}

type CopyNotice = 'link' | 'message' | null;

export function InviteShareCard({
  exchange,
  inviteUrl,
  isFull,
  participantsCount,
  targetCount,
  compactHeader = false,
}: InviteShareCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<CopyNotice>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const defaultMessage = useMemo(
    () =>
      buildInviteShareMessage({
        title: exchange.title,
        description: exchange.description,
        exchangeDate: exchange.exchange_date,
        budgetAmount: exchange.budget_amount,
        currency: exchange.currency,
        inviteCode: exchange.invite_code,
        inviteUrl,
      }),
    [
      exchange.budget_amount,
      exchange.currency,
      exchange.description,
      exchange.exchange_date,
      exchange.invite_code,
      exchange.title,
      inviteUrl,
    ],
  );

  const messageText = customMessage ?? defaultMessage;
  const isCustomized = customMessage !== null && customMessage !== defaultMessage;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const markCopied = (type: Exclude<CopyNotice, null>) => {
    setCopiedType(type);
    setCopyError(null);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedType(null);
      copyTimerRef.current = null;
    }, 2000);
  };

  const copyToClipboard = async (text: string, type: Exclude<CopyNotice, null>) => {
    setCopyError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      markCopied(type);
    } catch {
      setCopyError('Clipboard blocked — open the invite message below to copy manually.');
      if (type === 'message') {
        setExpanded(true);
      }
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    setCopyError(null);
    try {
      await navigator.share({
        title: exchange.title,
        text: messageText,
        url: inviteUrl,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      await copyToClipboard(messageText, 'message');
    }
  };

  return (
    <section
      aria-label="Invite link and code"
      className="rounded-xl border border-hairline bg-surface"
    >
      <div className={compactHeader ? 'space-y-3 p-4' : 'space-y-3 p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">Invite group</h2>
            <span className="rounded border border-hairline bg-surface-subtle/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
              {exchange.invite_code}
            </span>
          </div>
          {isFull && (
            <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[11px] font-medium text-seal">
              Full ({participantsCount}/{targetCount})
            </span>
          )}
        </div>

        <p className="truncate rounded-md border border-hairline bg-surface-subtle/45 px-2.5 py-1.5 font-mono text-xs text-ink-muted">
          {inviteUrl}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyToClipboard(inviteUrl, 'link')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-subtle/60 px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
          >
            {copiedType === 'link' ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Copy link
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void copyToClipboard(messageText, 'message')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-pine px-3 text-xs font-medium text-white transition-colors hover:bg-pine-hover"
          >
            {copiedType === 'message' ? (
              <>
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Message copied
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Copy invite
              </>
            )}
          </button>

          {canNativeShare && (
            <button
              type="button"
              onClick={() => void handleNativeShare()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
            >
              <ShareIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Share
            </button>
          )}

          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <span>{expanded ? 'Hide message' : 'Edit message'}</span>
            {expanded ? (
              <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {copyError && (
        <p
          role="status"
          aria-live="polite"
          className="border-t border-hairline px-4 py-2 text-xs text-seal"
        >
          {copyError}
        </p>
      )}

      {expanded && (
        <div className="border-t border-hairline bg-surface-subtle/35 p-4 space-y-2">
          <label htmlFor="invite-share-message" className="sr-only">
            Shareable invitation message
          </label>
          <textarea
            id="invite-share-message"
            rows={4}
            value={messageText}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs leading-relaxed text-ink"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>Paste into WhatsApp, Slack, or email.</span>
            {isCustomized && (
              <button
                type="button"
                onClick={() => setCustomMessage(null)}
                className="font-medium text-pine underline-offset-2 hover:underline"
              >
                Reset default
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
