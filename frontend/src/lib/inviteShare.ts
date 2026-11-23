import { formatBudget, formatExchangeDate } from './validation';

export interface InviteShareDetails {
  title: string;
  description?: string;
  exchangeDate?: string | null;
  budgetAmount?: number | null;
  currency?: string;
  inviteCode: string;
  inviteUrl: string;
}

/**
 * Composes a clean, ready-to-paste invitation message containing exchange details,
 * direct invite URL, and invite code.
 */
export function buildInviteShareMessage(details: InviteShareDetails): string {
  const cleanTitle = details.title.trim() || 'our gift exchange';
  const header = `You're invited to ${cleanTitle} on Àjọfún!`;

  const blocks: string[] = [header];

  const cleanNote = details.description?.trim();
  if (cleanNote) {
    blocks.push(cleanNote);
  }

  const metaLines: string[] = [];
  if (details.exchangeDate) {
    metaLines.push(`Date: ${formatExchangeDate(details.exchangeDate)}`);
  }
  if (
    details.budgetAmount !== null &&
    details.budgetAmount !== undefined &&
    !Number.isNaN(details.budgetAmount)
  ) {
    metaLines.push(`Budget: ${formatBudget(details.budgetAmount, details.currency || 'NGN')}`);
  }
  if (metaLines.length > 0) {
    blocks.push(metaLines.join('\n'));
  }

  blocks.push(`Join here: ${details.inviteUrl}\nInvite code: ${details.inviteCode}`);

  return blocks.join('\n\n');
}
