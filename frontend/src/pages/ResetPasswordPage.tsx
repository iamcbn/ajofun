import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EyeIcon, EyeOffIcon, SpinnerIcon } from '../components/Icons';
import { formatOtpError, OtpCodeInput } from '../components/OtpCodeInput';
import { useAuth } from '../hooks/useAuth';
import { sanitizeRedirectPath } from '../lib/validation';

const RESEND_COOLDOWN_SECONDS = 30;

export function ResetPasswordPage() {
  const { requestPasswordResetOtp, resetPasswordWithOtp, resetPasswordWithToken } = useAuth();
  const [searchParams] = useSearchParams();

  const safeRedirect = sanitizeRedirectPath(searchParams.get('redirect'));
  const tokenParam = searchParams.get('token')?.trim() ?? '';
  const errorParam = searchParams.get('error')?.trim() ?? '';
  const initialEmail = searchParams.get('email')?.trim() ?? '';

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [otpErrorCount, setOtpErrorCount] = useState(0);
  const [otpFieldError, setOtpFieldError] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    errorParam ? 'Your password reset link is invalid or expired. Request a new code below.' : null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const signInHref =
    safeRedirect !== '/'
      ? `/auth?redirect=${encodeURIComponent(safeRedirect)}`
      : '/auth';

  const handleRequestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setError(null);
    setOtpFieldError(false);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      const res = await requestPasswordResetOtp(cleanEmail);
      setEmail(cleanEmail);
      setOtp('');
      setOtpErrorCount(0);
      setDebugOtp(res.debugOtp ?? null);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('confirm');
      if (event === undefined) {
        setStatusMessage(`Sent a new reset code to ${cleanEmail}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPasswordReset = async (otpOverride?: string) => {
    if (submittingRef.current) return;

    setError(null);
    setOtpFieldError(false);
    setStatusMessage(null);

    const activeOtp = (otpOverride ?? otp).trim();
    if (!(tokenParam && !errorParam) && activeOtp.length < 6) {
      setOtpFieldError(true);
      setOtpErrorCount((count) => count + 1);
      setError('Enter the 6-digit code sent to your email.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (tokenParam && !errorParam) {
        await resetPasswordWithToken(tokenParam, newPassword);
      } else {
        await resetPasswordWithOtp(email, activeOtp, newPassword);
      }
      setStep('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update password.';
      const isPasswordOnlyError =
        /password/i.test(msg) && !/code|otp|expired|invalid|match/i.test(msg);
      if (!(tokenParam && !errorParam) && !isPasswordOnlyError) {
        setError(formatOtpError(err, 'Unable to update password.'));
        setOtpFieldError(true);
        setOtpErrorCount((count) => count + 1);
      } else {
        setError(msg);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void confirmPasswordReset();
  };

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md py-4">
        <section
          key="reset-done"
          className="otp-step-in space-y-4 rounded-lg border border-hairline bg-surface p-6 sm:p-7"
        >
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold text-ink">Password updated</h1>
            <p className="text-sm text-ink-muted">Sign in with your new password.</p>
          </div>
          <Link
            to={signInHref}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover"
          >
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  if (tokenParam && !errorParam) {
    return (
      <div className="mx-auto max-w-md py-4">
        <section
          key="reset-token"
          className="otp-step-in rounded-lg border border-hairline bg-surface p-6 sm:p-7"
        >
          <h1 className="font-display text-2xl font-semibold text-ink">Set a new password</h1>
          <p className="mt-1 text-sm text-ink-muted">Choose a new password for your account.</p>

          {error && (
            <div
              id="reset-token-error"
              role="alert"
              className="mt-4 rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-sm text-seal"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleConfirmReset} className="mt-5 space-y-4">
            <div>
              <label htmlFor="reset-new-password" className="block text-sm font-medium text-ink">
                New password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'reset-token-error' : undefined}
                  placeholder="At least 8 characters"
                  className="h-10 w-full rounded-md border border-hairline bg-surface pl-3 pr-10 text-sm text-ink placeholder:text-[#6B6660]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-pressed={showNewPassword}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                >
                  {showNewPassword ? (
                    <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <EyeIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-ink">
                Confirm new password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'reset-token-error' : undefined}
                  placeholder="Re-enter your password"
                  className="h-10 w-full rounded-md border border-hairline bg-surface pl-3 pr-10 text-sm text-ink placeholder:text-[#6B6660]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-pressed={showConfirmPassword}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                >
                  {showConfirmPassword ? (
                    <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <EyeIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </form>

          <div className="mt-5 border-t border-hairline pt-4 text-center text-sm text-ink-muted">
            <Link to={signInHref} className="font-medium text-pine underline-offset-2 hover:underline">
              &larr; Back to sign in
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-4">
      <section className="rounded-lg border border-hairline bg-surface p-6 sm:p-7">
        {step === 'request' ? (
          <div key="reset-request" className="otp-step-in">
            <h1 className="font-display text-2xl font-semibold text-ink">Reset your password</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Enter your email and we&apos;ll send a 6-digit reset code.
            </p>

            {error && (
              <div
                id="reset-request-error"
                role="alert"
                className="mt-4 rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-sm text-seal"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleRequestCode} className="mt-5 space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-ink">
                  Email address
                </label>
                <input
                  ref={emailInputRef}
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'reset-request-error' : undefined}
                  placeholder="you@example.com"
                  className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
                {submitting ? 'Sending code...' : 'Send reset code'}
              </button>
            </form>
          </div>
        ) : (
          <div key="reset-confirm" className="otp-step-in">
            <h1 className="font-display text-2xl font-semibold text-ink">Enter your reset code</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Code sent to <strong className="break-all font-medium text-ink">{email}</strong>
            </p>

            {__LOCAL_DEBUG__ && debugOtp && (
              <p
                role="status"
                className="mt-3 rounded-md border border-hairline bg-surface-subtle/60 px-3 py-2 font-mono text-xs text-ink"
              >
                Debug code: {debugOtp}
              </p>
            )}

            {!otpFieldError && error && (
              <div
                id="reset-confirm-error"
                role="alert"
                className="otp-step-in mt-4 rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-sm text-seal"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleConfirmReset} className="mt-5 space-y-4">
              <div className="space-y-2.5">
                <OtpCodeInput
                  idPrefix="reset-otp"
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    if (otpFieldError) {
                      setOtpFieldError(false);
                      setError(null);
                    }
                    if (statusMessage) {
                      setStatusMessage(null);
                    }
                  }}
                  onComplete={(code) => {
                    if (newPassword.length >= 8 && newPassword === confirmPassword) {
                      void confirmPasswordReset(code);
                    } else {
                      passwordInputRef.current?.focus();
                    }
                  }}
                  hasError={otpFieldError}
                  errorTrigger={otpErrorCount}
                  autoFocus
                  disabled={submitting}
                  groupLabel="6-digit reset code"
                  describedBy={(otpFieldError && error) || statusMessage ? 'reset-otp-feedback' : undefined}
                />

                {((otpFieldError && error) || statusMessage) && (
                  <div id="reset-otp-feedback">
                    {otpFieldError && error ? (
                      <p role="alert" className="otp-step-in text-sm font-medium text-seal">
                        {error}
                      </p>
                    ) : (
                      <p role="status" className="otp-step-in text-xs font-medium text-pine">
                        {statusMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="reset-otp-password" className="block text-sm font-medium text-ink">
                  New password
                </label>
                <div className="relative mt-1.5">
                  <input
                    ref={passwordInputRef}
                    id="reset-otp-password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    aria-invalid={!otpFieldError && error ? 'true' : undefined}
                    aria-describedby={!otpFieldError && error ? 'reset-confirm-error' : undefined}
                    placeholder="At least 8 characters"
                    className="h-10 w-full rounded-md border border-hairline bg-surface pl-3 pr-10 text-sm text-ink placeholder:text-[#6B6660]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-pressed={showNewPassword}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  >
                    {showNewPassword ? (
                      <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-otp-confirm" className="block text-sm font-medium text-ink">
                  Confirm new password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="reset-otp-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={!otpFieldError && error ? 'true' : undefined}
                    aria-describedby={!otpFieldError && error ? 'reset-confirm-error' : undefined}
                    placeholder="Re-enter your password"
                    className="h-10 w-full rounded-md border border-hairline bg-surface pl-3 pr-10 text-sm text-ink placeholder:text-[#6B6660]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-pressed={showConfirmPassword}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  >
                    {showConfirmPassword ? (
                      <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || otp.trim().length < 6}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
                {submitting ? 'Updating...' : 'Update password'}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <div className="flex items-center gap-1.5">
                <span>Didn&apos;t get it?</span>
                <button
                  type="button"
                  disabled={submitting || cooldown > 0}
                  onClick={() => void handleRequestCode()}
                  className="font-medium tabular-nums text-pine underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setStep('request');
                  setOtp('');
                  setOtpFieldError(false);
                  setOtpErrorCount(0);
                  setDebugOtp(null);
                  setError(null);
                  setStatusMessage(null);
                  window.requestAnimationFrame(() => {
                    emailInputRef.current?.focus();
                  });
                }}
                className="hover:text-ink"
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-hairline pt-4 text-center text-sm text-ink-muted">
          <Link to={signInHref} className="font-medium text-pine underline-offset-2 hover:underline">
            &larr; Back to sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
