import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  buildGoogleCalendarUrl,
  downloadExchangeIcs,
  type ExchangeCalendarEvent,
} from '../lib/calendar';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from './Icons';

interface AddToCalendarMenuProps {
  event: ExchangeCalendarEvent;
}

export function AddToCalendarMenu({ event }: AddToCalendarMenuProps) {
  const [open, setOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<number | null>(null);

  const googleUrl = useMemo(() => buildGoogleCalendarUrl(event), [event]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.requestAnimationFrame(() => {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    });

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!googleUrl) {
    return null;
  }

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleDownloadIcs = () => {
    const ok = downloadExchangeIcs(event);
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
    if (ok) {
      setSavedNotice(true);
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = window.setTimeout(() => {
        setSavedNotice(false);
        savedTimerRef.current = null;
      }, 2200);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-surface-subtle"
      >
        {savedNotice ? (
          <>
            <CheckIcon className="h-3 w-3 text-pine" aria-hidden="true" />
            <span>Saved .ics</span>
          </>
        ) : (
          <>
            <CalendarIcon className="h-3 w-3 text-pine" aria-hidden="true" />
            <span>Add to calendar</span>
            <ChevronDownIcon className="h-3 w-3 text-ink-muted" aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Add exchange date to calendar"
          onKeyDown={handleMenuKeyDown}
          className="absolute left-0 z-30 mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-hairline bg-surface p-1 shadow-md sm:left-auto sm:right-0"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadIcs}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-surface-subtle focus:bg-surface-subtle"
          >
            <DownloadIcon className="h-3.5 w-3.5 shrink-0 text-pine" aria-hidden="true" />
            <span>Download .ics (Apple / Outlook)</span>
          </button>

          <a
            role="menuitem"
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle focus:bg-surface-subtle"
          >
            <span className="inline-flex items-center gap-2">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-pine" aria-hidden="true" />
              <span>Google Calendar</span>
            </span>
            <ExternalLinkIcon className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
