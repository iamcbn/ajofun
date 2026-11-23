import { formatBudget } from './validation';

export interface ExchangeCalendarEvent {
  id: string;
  title: string;
  exchangeDate: string;
  description?: string;
  budgetAmount?: number | null;
  currency?: string;
  exchangeUrl: string;
}

interface ParsedDateRange {
  startYmd: string;
  endYmd: string;
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function formatUtcYmd(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = padTwo(date.getUTCMonth() + 1);
  const d = padTwo(date.getUTCDate());
  return `${y}${m}${d}`;
}

function parseIsoDateRange(dateStr: string): ParsedDateRange | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }

  const end = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    startYmd: formatUtcYmd(start),
    endYmd: formatUtcYmd(end),
  };
}

function buildCalendarDetails(event: ExchangeCalendarEvent): string {
  const metaLines: string[] = [];
  if (
    event.budgetAmount !== null &&
    event.budgetAmount !== undefined &&
    !Number.isNaN(event.budgetAmount)
  ) {
    metaLines.push(`Budget: ${formatBudget(event.budgetAmount, event.currency || 'NGN')}`);
  }

  const blocks: string[] = [];
  if (metaLines.length > 0) {
    blocks.push(metaLines.join('\n'));
  }
  const cleanDescription = event.description?.trim();
  if (cleanDescription) {
    blocks.push(cleanDescription);
  }
  const cleanUrl = event.exchangeUrl.trim();
  if (cleanUrl) {
    blocks.push(`Exchange page: ${cleanUrl}`);
  }

  return blocks.join('\n\n');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    const maxBytes = chunks.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks.join('\r\n ');
}

function formatUtcTimestamp(date: Date): string {
  return (
    `${String(date.getUTCFullYear()).padStart(4, '0')}` +
    `${padTwo(date.getUTCMonth() + 1)}` +
    `${padTwo(date.getUTCDate())}T` +
    `${padTwo(date.getUTCHours())}` +
    `${padTwo(date.getUTCMinutes())}` +
    `${padTwo(date.getUTCSeconds())}Z`
  );
}

/**
 * Builds a Google Calendar template URL for an all-day gift exchange reminder.
 */
export function buildGoogleCalendarUrl(event: ExchangeCalendarEvent): string | null {
  const range = parseIsoDateRange(event.exchangeDate);
  if (!range) return null;

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.title.trim() || 'Gift Exchange');
  url.searchParams.set('dates', `${range.startYmd}/${range.endYmd}`);

  const details = buildCalendarDetails(event);
  if (details) {
    url.searchParams.set('details', details);
  }
  return url.toString();
}

/**
 * Generates an RFC 5545 .ics calendar string with a subtle 1-day-prior reminder.
 */
export function buildExchangeIcsContent(
  event: ExchangeCalendarEvent,
  now: Date = new Date(),
): string | null {
  const range = parseIsoDateRange(event.exchangeDate);
  if (!range) return null;

  const title = event.title.trim() || 'Gift Exchange';
  const details = buildCalendarDetails(event);
  const safeUid = `exchange-${event.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'event'}@ajofun`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ajofun//Gift Exchange//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${safeUid}`,
    `DTSTAMP:${formatUtcTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${range.startYmd}`,
    `DTEND;VALUE=DATE:${range.endYmd}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];

  if (details) {
    lines.push(`DESCRIPTION:${escapeIcsText(details)}`);
  }
  const safeUrl = event.exchangeUrl.replace(/[\r\n\u0000-\u001F\u007F]/g, '').trim();
  if (safeUrl) {
    lines.push(`URL:${safeUrl}`);
  }

  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-P1D',
    `DESCRIPTION:${escapeIcsText(`Gift exchange tomorrow: ${title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/**
 * Sanitizes an exchange title into a safe .ics download filename.
 */
export function formatCalendarFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'gift-exchange'}.ics`;
}

/**
 * Triggers a browser download of an .ics calendar event file.
 */
export function downloadExchangeIcs(event: ExchangeCalendarEvent): boolean {
  const content = buildExchangeIcsContent(event);
  if (!content || typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = formatCalendarFilename(event.title);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
  return true;
}
