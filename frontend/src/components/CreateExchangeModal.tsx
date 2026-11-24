import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { neonDataApi } from '../lib/neon';
import { getTomorrowLocalDateString } from '../lib/validation';
import type { Exchange } from '../types/database';
import { CheckIcon, ChevronDownIcon, CloseIcon, SpinnerIcon } from './Icons';
import { formatOtpError, OtpCodeInput } from './OtpCodeInput';

interface CreateExchangeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (exchangeId: string) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const RESEND_COOLDOWN_SECONDS = 30;
const CURRENCY_OPTIONS = [
  { value: 'NGN', label: 'NGN ₦' },
  { value: 'USD', label: 'USD $' },
  { value: 'EUR', label: 'EUR €' },
  { value: 'GBP', label: 'GBP £' },
  { value: 'CAD', label: 'CAD $' },
  { value: 'AUD', label: 'AUD $' },
  { value: 'GHS', label: 'GHS ₵' },
  { value: 'KES', label: 'KES' },
  { value: 'ZAR', label: 'ZAR R' },
  { value: 'OTHER', label: 'Other' },
] as const;

export function CreateExchangeModal({ open, onClose, onCreated }: CreateExchangeModalProps) {
  const { user, sendEmailVerificationOtp, verifyEmailWithOtp } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sendOtpBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const verifyTimerRef = useRef<number | null>(null);
  const otpVerifyingRef = useRef(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [customCurrency, setCustomCurrency] = useState('');
  const [exchangeDate, setExchangeDate] = useState('');
  const [targetParticipants, setTargetParticipants] = useState('');
  const [joinMyself, setJoinMyself] = useState(true);
  const [myDisplayName, setMyDisplayName] = useState(() => user?.name ?? '');
  const [myAlias, setMyAlias] = useState('');
  const [showNicknameField, setShowNicknameField] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerifiedSuccess, setOtpVerifiedSuccess] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpErrorCount, setOtpErrorCount] = useState(0);
  const [otpStatus, setOtpStatus] = useState<string | null>(null);

  const lockedAccountName = (user?.name ?? '').trim();
  const isEmailVerified = Boolean(user?.emailVerified);
  const showVerificationGate = Boolean(
    user && (!isEmailVerified || otpVerifying || otpVerifiedSuccess),
  );
  const isBusy = submitting || otpVerifying || otpSending;

  useEffect(() => {
    return () => {
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current);
        verifyTimerRef.current = null;
      }
      setTitle('');
      setDescription('');
      setBudgetAmount('');
      setCurrency('NGN');
      setCustomCurrency('');
      setExchangeDate('');
      setTargetParticipants('');
      setJoinMyself(true);
      setMyDisplayName(lockedAccountName);
      setMyAlias('');
      setShowNicknameField(false);
      setSubmitting(false);
      setError(null);
      setOtpSent(false);
      setOtp('');
      setDebugOtp(null);
      setOtpCooldown(0);
      otpVerifyingRef.current = false;
      setOtpSending(false);
      setOtpVerifying(false);
      setOtpVerifiedSuccess(false);
      setOtpError(null);
      setOtpErrorCount(0);
      setOtpStatus(null);
    }
  }, [open, lockedAccountName]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (open && lockedAccountName) {
      setMyDisplayName(lockedAccountName);
    }
  }, [open, lockedAccountName]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (!showVerificationGate) {
        titleInputRef.current?.focus();
      } else if (!otpSent) {
        sendOtpBtnRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, showVerificationGate, otpSent]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isBusy) {
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.getClientRects().length > 0);

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isBusy]);

  if (!open) {
    return null;
  }

  const minExchangeDate = getTomorrowLocalDateString();
  const selectedCurrencyLabel =
    CURRENCY_OPTIONS.find((opt) => opt.value === currency)?.label ?? currency;
  const clearError = () => {
    if (error) setError(null);
  };

  const handleSendHostOtp = async () => {
    if (!user?.email) return;
    setOtpError(null);
    setOtpStatus(null);
    setOtpSending(true);
    try {
      const res = await sendEmailVerificationOtp(user.email);
      setOtp('');
      setDebugOtp(res.debugOtp ?? null);
      setOtpCooldown(RESEND_COOLDOWN_SECONDS);
      setOtpStatus(otpSent ? `Sent a new code to ${user.email}.` : null);
      setOtpSent(true);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setOtpSending(false);
    }
  };

  const verifyHostOtp = async (code: string) => {
    if (!user?.email || otpVerifiedSuccess || otpVerifyingRef.current) return;

    const cleanOtp = code.trim();
    if (cleanOtp.length < 6) {
      setOtpError('Enter the 6-digit verification code.');
      setOtpErrorCount((count) => count + 1);
      return;
    }

    otpVerifyingRef.current = true;
    setOtpError(null);
    setOtpStatus(null);
    setOtpVerifying(true);
    try {
      await verifyEmailWithOtp(user.email, cleanOtp);
      setOtpVerifiedSuccess(true);
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current);
      }
      verifyTimerRef.current = window.setTimeout(() => {
        verifyTimerRef.current = null;
        setOtpVerifiedSuccess(false);
        setOtp('');
        setDebugOtp(null);
        setOtpSent(false);
        setOtpError(null);
        setOtpStatus(null);
      }, 380);
    } catch (err) {
      setOtpError(formatOtpError(err));
      setOtpErrorCount((count) => count + 1);
    } finally {
      otpVerifyingRef.current = false;
      setOtpVerifying(false);
    }
  };

  const handleVerifyHostOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyHostOtp(otp);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setError('Exchange title must be at least 2 characters.');
      return;
    }

    let parsedBudget: number | null = null;
    if (budgetAmount.trim()) {
      const numeric = Number(budgetAmount);
      if (Number.isNaN(numeric) || numeric < 0) {
        setError('Budget must be zero or a positive number.');
        return;
      }
      parsedBudget = numeric;
    }

    if (exchangeDate) {
      const earliestAllowedDate = getTomorrowLocalDateString();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exchangeDate) || exchangeDate < earliestAllowedDate) {
        setError('Exchange date must be a future date (after today).');
        return;
      }
    }

    let parsedTarget: number | null = null;
    if (targetParticipants.trim()) {
      const numericTarget = Number(targetParticipants.trim());
      if (!Number.isInteger(numericTarget) || numericTarget < 3) {
        setError('Participant limit must be a whole number of at least 3.');
        return;
      }
      parsedTarget = numericTarget;
    }

    let resolvedCurrency = currency.trim() || 'NGN';
    if (currency === 'OTHER') {
      const cleanCustom = customCurrency.trim();
      if (parsedBudget !== null && !cleanCustom) {
        setError('Enter a currency code or symbol (e.g. CHF, AED, ¥).');
        return;
      }
      if (cleanCustom.length > 10) {
        setError('Currency code or symbol must be 10 characters or fewer.');
        return;
      }
      resolvedCurrency = cleanCustom || 'NGN';
    }

    const cleanDisplayName = (lockedAccountName || myDisplayName).trim();
    if (joinMyself && !cleanDisplayName) {
      setError('Enter your display name so others know you are participating.');
      return;
    }

    let cleanAlias = myAlias.trim().slice(0, 40);
    if (cleanAlias.toLowerCase() === cleanDisplayName.toLowerCase()) {
      cleanAlias = '';
    }

    setSubmitting(true);
    try {
      const createdRows = await neonDataApi.insert<Exchange>('exchanges', {
        title: cleanTitle,
        description: description.trim(),
        budget_amount: parsedBudget,
        currency: resolvedCurrency,
        exchange_date: exchangeDate || null,
        target_participants: parsedTarget,
      });

      const created = createdRows[0];
      if (!created) {
        throw new Error('Exchange was not returned after creation.');
      }

      if (joinMyself) {
        await neonDataApi.insert('participants', {
          exchange_id: created.id,
          display_name: cleanDisplayName,
          alias: cleanAlias,
          wishlist_items: [],
          dislikes: '',
          delivery_notes: '',
        });
      }

      onCreated(created.id);
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : 'Could not create exchange.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="otp-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-exchange-title"
        className={`otp-modal-in flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-md transition-[max-width] duration-300 ease-out sm:max-h-[calc(100dvh-2rem)] ${
          showVerificationGate ? 'max-w-[420px]' : 'max-w-lg'
        }`}
      >
        {showVerificationGate ? (
          <div className="overflow-y-auto p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <h2 id="create-exchange-title" className="font-display text-2xl font-semibold text-ink">
                Verify your email
              </h2>
              <button
                type="button"
                disabled={isBusy}
                onClick={onClose}
                aria-label="Close modal"
                className="-mr-1.5 -mt-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CloseIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!otpSent ? (
              <div key="otp-request" className="otp-step-in">
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Confirm <strong className="break-all font-medium text-ink">{user?.email}</strong>{' '}
                  before hosting an exchange. We&apos;ll send a 6-digit code.
                </p>

                {otpError && (
                  <p role="alert" className="otp-step-in mt-3 text-sm font-medium text-seal">
                    {otpError}
                  </p>
                )}

                <div className="mt-6">
                  <button
                    ref={sendOtpBtnRef}
                    type="button"
                    disabled={otpSending}
                    onClick={() => void handleSendHostOtp()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine px-5 text-sm font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {otpSending && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
                    {otpSending ? 'Sending...' : 'Send code'}
                  </button>
                </div>
              </div>
            ) : (
              <div key="otp-entry" className="otp-step-in">
                <p className="mt-2 text-sm text-ink-muted">
                  Enter the 6-digit code sent to{' '}
                  <strong className="break-all font-medium text-ink">{user?.email}</strong>.
                </p>

                {__LOCAL_DEBUG__ && debugOtp && (
                  <p
                    role="status"
                    className="mt-3 rounded-md border border-hairline bg-surface-subtle/60 px-3 py-2 font-mono text-xs text-ink"
                  >
                    Debug code: {debugOtp}
                  </p>
                )}

                <form onSubmit={handleVerifyHostOtp} className="mt-6">
                  <OtpCodeInput
                    idPrefix="host-verify-otp"
                    value={otp}
                    onChange={(next) => {
                      setOtp(next);
                      if (otpError) setOtpError(null);
                      if (otpStatus) setOtpStatus(null);
                    }}
                    onComplete={(code) => void verifyHostOtp(code)}
                    hasError={Boolean(otpError)}
                    errorTrigger={otpErrorCount}
                    isVerifying={otpVerifying}
                    isVerified={otpVerifiedSuccess}
                    autoFocus
                    disabled={otpVerifying || otpVerifiedSuccess}
                    groupLabel="6-digit verification code"
                    describedBy={
                      otpVerifying || otpVerifiedSuccess || otpError || otpStatus
                        ? 'host-verify-otp-feedback'
                        : undefined
                    }
                  />

                  <div id="host-verify-otp-feedback" className="mt-3 min-h-[20px]">
                    {otpVerifying ? (
                      <p
                        role="status"
                        className="otp-step-in inline-flex items-center gap-1.5 text-sm font-medium text-pine"
                      >
                        <SpinnerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Verifying code...
                      </p>
                    ) : otpVerifiedSuccess ? (
                      <p
                        role="status"
                        className="otp-step-in inline-flex items-center gap-1.5 text-sm font-medium text-pine"
                      >
                        <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Email verified
                      </p>
                    ) : otpError ? (
                      <p role="alert" className="otp-step-in text-sm font-medium text-seal">
                        {otpError}
                      </p>
                    ) : otpStatus ? (
                      <p role="status" className="otp-step-in text-xs font-medium text-pine">
                        {otpStatus}
                      </p>
                    ) : null}
                  </div>
                </form>

                <div className="mt-6 flex items-center gap-1.5 border-t border-hairline/80 pt-4 text-xs text-ink-muted">
                  <span>Didn&apos;t get it?</span>
                  <button
                    type="button"
                    disabled={otpSending || otpVerifying || otpVerifiedSuccess || otpCooldown > 0}
                    onClick={() => void handleSendHostOtp()}
                    className="font-medium tabular-nums text-pine underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
                  >
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <h2 id="create-exchange-title" className="font-display text-2xl font-semibold text-ink">
                  Start a gift exchange
                </h2>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CloseIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form
              key="exchange-form"
              noValidate
              onSubmit={handleSubmit}
              className="otp-step-in flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {error && (
                  <div
                    role="alert"
                    className="rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-sm text-seal"
                  >
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10.5rem]">
                  <div>
                    <label htmlFor="ex-title" className="block text-sm font-medium text-ink">
                      Exchange name
                    </label>
                    <input
                      ref={titleInputRef}
                      id="ex-title"
                      type="text"
                      required
                      maxLength={100}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        clearError();
                      }}
                      placeholder="e.g. Design Team Gift Swap"
                      className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ex-target-participants"
                      className="block text-sm font-medium text-ink"
                    >
                      Participant limit
                    </label>
                    <input
                      id="ex-target-participants"
                      type="number"
                      min="3"
                      step="1"
                      value={targetParticipants}
                      onChange={(e) => {
                        setTargetParticipants(e.target.value);
                        clearError();
                      }}
                      placeholder="No limit"
                      className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ex-budget" className="block text-sm font-medium text-ink">
                      Budget
                    </label>
                    <div className="mt-1.5 flex h-10 w-full overflow-hidden rounded-md border border-hairline bg-surface transition-colors focus-within:border-pine focus-within:ring-1 focus-within:ring-pine">
                      <div className="relative flex h-full w-24 shrink-0 items-center justify-between border-r border-hairline bg-surface-subtle/60 px-2.5 transition-colors focus-within:bg-surface-subtle">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none truncate text-xs font-medium text-ink"
                        >
                          {selectedCurrencyLabel}
                        </span>
                        <ChevronDownIcon
                          className="pointer-events-none h-3.5 w-3.5 shrink-0 text-ink-muted"
                          aria-hidden="true"
                        />
                        <select
                          id="ex-currency"
                          aria-label="Currency"
                          value={currency}
                          onChange={(e) => {
                            setCurrency(e.target.value);
                            clearError();
                          }}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          {CURRENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        id="ex-budget"
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetAmount}
                        onChange={(e) => {
                          setBudgetAmount(e.target.value);
                          clearError();
                        }}
                        placeholder="No limit"
                        className="h-full min-w-0 flex-1 bg-transparent px-3 py-0 text-sm text-ink placeholder:text-[#6B6660] focus:outline-none focus:shadow-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ex-date" className="block text-sm font-medium text-ink">
                      Exchange date
                    </label>
                    <input
                      id="ex-date"
                      type="date"
                      min={minExchangeDate}
                      value={exchangeDate}
                      onChange={(e) => {
                        setExchangeDate(e.target.value);
                        clearError();
                      }}
                      className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink"
                    />
                  </div>
                </div>

                {currency === 'OTHER' && (
                  <div>
                    <label htmlFor="ex-custom-currency" className="block text-sm font-medium text-ink">
                      Custom currency code or symbol
                    </label>
                    <input
                      id="ex-custom-currency"
                      type="text"
                      required={Boolean(budgetAmount.trim())}
                      maxLength={10}
                      value={customCurrency}
                      onChange={(e) => {
                        setCustomCurrency(e.target.value);
                        clearError();
                      }}
                      placeholder="e.g. CHF, AED, ¥"
                      className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="ex-description" className="block text-sm font-medium text-ink">
                    Note for participants
                  </label>
                  <textarea
                    id="ex-description"
                    rows={2}
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Gift guidelines, wrap rules, or meetup spot"
                    className="mt-1.5 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-[#6B6660]"
                  />
                </div>

                <div className="space-y-2.5 border-t border-hairline pt-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={joinMyself}
                        onChange={(e) => setJoinMyself(e.target.checked)}
                        className="h-4 w-4 rounded border-hairline accent-pine"
                      />
                      <span>
                        Include me in the draw
                        {joinMyself && lockedAccountName && (
                          <span className="font-normal text-ink-muted">
                            {' '}
                            &middot; {lockedAccountName}
                          </span>
                        )}
                      </span>
                    </label>

                    {joinMyself && lockedAccountName && !showNicknameField && (
                      <button
                        type="button"
                        onClick={() => setShowNicknameField(true)}
                        className="text-xs font-medium text-pine underline-offset-2 hover:underline"
                      >
                        + Add nickname
                      </button>
                    )}
                  </div>

                  {joinMyself &&
                    (lockedAccountName ? (
                      showNicknameField && (
                        <div className="flex items-center gap-2">
                          <label htmlFor="ex-organizer-alias" className="sr-only">
                            Nickname
                          </label>
                          <input
                            id="ex-organizer-alias"
                            type="text"
                            maxLength={40}
                            value={myAlias}
                            onChange={(e) => setMyAlias(e.target.value)}
                            placeholder="Nickname shown beside your real name"
                            className="h-9 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setMyAlias('');
                              setShowNicknameField(false);
                            }}
                            className="shrink-0 px-1.5 py-1 text-xs text-ink-muted hover:text-ink"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="ex-organizer-name" className="sr-only">
                            Your name
                          </label>
                          <input
                            id="ex-organizer-name"
                            type="text"
                            required
                            maxLength={80}
                            value={myDisplayName}
                            onChange={(e) => {
                              setMyDisplayName(e.target.value);
                              clearError();
                            }}
                            placeholder="Your name"
                            className="h-9 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                          />
                        </div>
                        <div>
                          <label htmlFor="ex-organizer-alias" className="sr-only">
                            Nickname
                          </label>
                          <input
                            id="ex-organizer-alias"
                            type="text"
                            maxLength={40}
                            value={myAlias}
                            onChange={(e) => setMyAlias(e.target.value)}
                            placeholder="Nickname (optional)"
                            className="h-9 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-hairline bg-surface-subtle/40 px-6 py-3.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClose}
                  className="h-10 rounded-md border border-hairline bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-pine px-5 text-sm font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
                  {submitting ? 'Creating...' : 'Create exchange'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
