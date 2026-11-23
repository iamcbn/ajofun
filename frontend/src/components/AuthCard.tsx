import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthApiError } from '../lib/neon';
import { sanitizeRedirectPath } from '../lib/validation';
import { CheckIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from './Icons';
import { formatOtpError, OtpCodeInput } from './OtpCodeInput';

interface AuthCardProps {
  redirectPath?: string;
  initialMode?: 'signin' | 'signup';
  headingAs?: 'h1' | 'h2';
  heading?: string;
  subheading?: string;
  signupHeading?: string;
  signupSubheading?: string;
  onSuccess?: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

export function AuthCard({
  redirectPath = '/',
  initialMode = 'signin',
  headingAs = 'h2',
  heading,
  subheading,
  signupHeading,
  signupSubheading,
  onSuccess,
}: AuthCardProps) {
  const {
    signInWithEmail,
    signUpWithEmail,
    sendEmailVerificationOtp,
    verifyEmailWithOtp,
    signInWithGoogle,
  } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const verifyTimerRef = useRef<number | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const otpVerifyingRef = useRef(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpErrorCount, setOtpErrorCount] = useState(0);
  const [otpVerifiedSuccess, setOtpVerifiedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingProvider, setSubmittingProvider] = useState<
    'email' | 'google' | 'otp' | 'resend' | null
  >(null);
  const submitting = submittingProvider !== null;

  const safeRedirect = sanitizeRedirectPath(redirectPath);
  const HeadingTag = headingAs;

  useEffect(() => {
    return () => {
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const switchMode = (nextMode: 'signin' | 'signup', restoreFocus = false) => {
    setError(null);
    setMode(nextMode);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (nextMode === 'signup') {
          nameInputRef.current?.focus();
        } else {
          emailInputRef.current?.focus();
        }
      });
    }
  };

  const startEmailVerification = async (targetEmail: string, notice: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    const res = await sendEmailVerificationOtp(cleanEmail);
    setPendingVerificationEmail(cleanEmail);
    setOtp('');
    setDebugOtp(res.debugOtp ?? null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    otpVerifyingRef.current = false;
    setOtpErrorCount(0);
    setOtpVerifiedSuccess(false);
    setStatusMessage(notice);
    setError(null);
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    setSubmittingProvider('email');

    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === 'signup') {
        const cleanName = name.trim();
        if (!cleanName) {
          setError('Please enter your name.');
          setSubmittingProvider(null);
          return;
        }
        const result = await signUpWithEmail(cleanName, cleanEmail, password);
        if (result.requiresEmailVerification) {
          await startEmailVerification(cleanEmail, '');
          return;
        }
        onSuccess?.();
      } else {
        await signInWithEmail(cleanEmail, password);
        onSuccess?.();
      }
    } catch (authErr) {
      const isUnverified =
        (authErr instanceof AuthApiError && authErr.code === 'EMAIL_NOT_VERIFIED') ||
        (authErr instanceof Error && /not\s+verified|verify\s+your\s+email/i.test(authErr.message));
      if (isUnverified && cleanEmail) {
        try {
          await startEmailVerification(cleanEmail, 'Verify your email before signing in.');
          return;
        } catch (otpErr) {
          setError(otpErr instanceof Error ? otpErr.message : 'Could not send verification code.');
          return;
        }
      }
      setError(authErr instanceof Error ? authErr.message : 'Authentication failed.');
    } finally {
      setSubmittingProvider(null);
    }
  };

  const verifyAuthOtp = async (code: string) => {
    if (!pendingVerificationEmail || otpVerifiedSuccess || otpVerifyingRef.current) return;

    const cleanOtp = code.trim();
    if (cleanOtp.length < 6) {
      setError('Enter the 6-digit verification code.');
      setOtpErrorCount((count) => count + 1);
      return;
    }

    otpVerifyingRef.current = true;
    setError(null);
    setStatusMessage(null);
    setSubmittingProvider('otp');
    try {
      await verifyEmailWithOtp(pendingVerificationEmail, cleanOtp);
      setOtpVerifiedSuccess(true);
      if (verifyTimerRef.current !== null) {
        window.clearTimeout(verifyTimerRef.current);
      }
      verifyTimerRef.current = window.setTimeout(() => {
        verifyTimerRef.current = null;
        setPendingVerificationEmail(null);
        setOtp('');
        setDebugOtp(null);
        setOtpVerifiedSuccess(false);
        onSuccess?.();
      }, 320);
    } catch (verifyErr) {
      setError(formatOtpError(verifyErr));
      setOtpErrorCount((count) => count + 1);
    } finally {
      otpVerifyingRef.current = false;
      setSubmittingProvider(null);
    }
  };

  const handleOtpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyAuthOtp(otp);
  };

  const handleResendOtp = async () => {
    if (!pendingVerificationEmail || cooldown > 0 || otpVerifiedSuccess) return;
    setError(null);
    setSubmittingProvider('resend');
    try {
      const res = await sendEmailVerificationOtp(pendingVerificationEmail);
      setOtp('');
      setOtpErrorCount(0);
      setDebugOtp(res.debugOtp ?? null);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStatusMessage(`Sent a new code to ${pendingVerificationEmail}.`);
    } catch (resendErr) {
      setError(resendErr instanceof Error ? resendErr.message : 'Could not resend verification code.');
    } finally {
      setSubmittingProvider(null);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmittingProvider('google');
    try {
      await signInWithGoogle(safeRedirect);
    } catch (oauthErr) {
      setError(oauthErr instanceof Error ? oauthErr.message : 'Google sign-in failed.');
      setSubmittingProvider(null);
    }
  };

  if (pendingVerificationEmail) {
    const isVerifyingOtp = submittingProvider === 'otp';
    return (
      <section
        key="auth-verify-otp"
        className="otp-step-in rounded-xl border border-hairline bg-surface p-6 sm:p-7"
      >
        <HeadingTag className="font-display text-2xl font-semibold text-ink">
          Verify your email
        </HeadingTag>
        <p className="mt-2 text-sm text-ink-muted">
          Enter the 6-digit code sent to{' '}
          <strong className="break-all font-medium text-ink">{pendingVerificationEmail}</strong>.
        </p>

        {__LOCAL_DEBUG__ && debugOtp && (
          <p
            role="status"
            className="mt-3 rounded-md border border-hairline bg-surface-subtle/60 px-3 py-2 font-mono text-xs text-ink"
          >
            Debug code: {debugOtp}
          </p>
        )}

        <form onSubmit={handleOtpSubmit} className="mt-6">
          <OtpCodeInput
            idPrefix="auth-verify-otp"
            value={otp}
            onChange={(next) => {
              setOtp(next);
              if (error) setError(null);
              if (statusMessage) setStatusMessage(null);
            }}
            onComplete={(code) => void verifyAuthOtp(code)}
            hasError={Boolean(error)}
            errorTrigger={otpErrorCount}
            isVerifying={isVerifyingOtp}
            isVerified={otpVerifiedSuccess}
            autoFocus
            disabled={submitting || otpVerifiedSuccess}
            groupLabel="6-digit verification code"
            describedBy={
              isVerifyingOtp || otpVerifiedSuccess || error || statusMessage
                ? 'auth-verify-otp-feedback'
                : undefined
            }
          />

          <div id="auth-verify-otp-feedback" className="mt-3 min-h-[20px]">
            {isVerifyingOtp ? (
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
            ) : error ? (
              <p role="alert" className="otp-step-in text-sm font-medium text-seal">
                {error}
              </p>
            ) : statusMessage ? (
              <p role="status" className="otp-step-in text-xs font-medium text-pine">
                {statusMessage}
              </p>
            ) : null}
          </div>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-hairline/80 pt-4 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span>Didn&apos;t get it?</span>
            <button
              type="button"
              disabled={submitting || otpVerifiedSuccess || cooldown > 0}
              onClick={() => void handleResendOtp()}
              className="font-medium tabular-nums text-pine underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
          <button
            type="button"
            disabled={submitting || otpVerifiedSuccess}
            onClick={() => {
              setPendingVerificationEmail(null);
              setOtp('');
              setDebugOtp(null);
              setOtpErrorCount(0);
              otpVerifyingRef.current = false;
              setOtpVerifiedSuccess(false);
              setStatusMessage(null);
              switchMode('signin', true);
            }}
            className="font-medium text-ink-muted hover:text-ink"
          >
            Back to sign in
          </button>
        </div>
      </section>
    );
  }

  const titleText =
    mode === 'signup'
      ? (signupHeading ?? heading ?? 'Create your account')
      : (heading ?? 'Sign in');
  const subtitleText =
    mode === 'signup'
      ? (signupSubheading ??
        subheading ??
        'Set up your profile to host or join private exchanges.')
      : (subheading ?? 'Sign in to view your exchanges or draw names.');

  const resetPasswordHref = `/reset-password?redirect=${encodeURIComponent(safeRedirect)}${
    email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''
  }`;

  return (
    <section
      key="auth-main"
      className="otp-step-in rounded-xl border border-hairline bg-surface p-6 sm:p-7"
    >
      <div
        role="group"
        aria-label="Account action"
        className="mb-5 grid grid-cols-2 rounded-lg border border-hairline bg-surface-subtle p-1"
      >
        <button
          type="button"
          aria-pressed={mode === 'signin'}
          disabled={submitting}
          onClick={() => switchMode('signin', true)}
          className={`h-9 rounded-md text-xs font-medium transition-colors ${
            mode === 'signin'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === 'signup'}
          disabled={submitting}
          onClick={() => switchMode('signup', true)}
          className={`h-9 rounded-md text-xs font-medium transition-colors ${
            mode === 'signup'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          Create account
        </button>
      </div>

      <HeadingTag className="font-display text-2xl font-semibold text-ink">{titleText}</HeadingTag>
      <p className="mt-1 text-sm text-ink-muted">{subtitleText}</p>

      {error && (
        <div
          id="auth-form-error"
          role="alert"
          className="mt-4 rounded-md border border-seal/30 bg-seal/5 px-3.5 py-2.5 text-sm text-seal"
        >
          {error}
        </div>
      )}

      <div className="mt-5">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleGoogle()}
          className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-hairline bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingProvider === 'google' ? (
            <>
              <SpinnerIcon className="h-4 w-4" aria-hidden="true" />
              Connecting to Google...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
        <div className="h-px flex-1 bg-hairline" />
        <span>or use email</span>
        <div className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div className="otp-step-in">
            <label htmlFor="auth-name" className="block text-sm font-medium text-ink">
              Full name
            </label>
            <input
              ref={nameInputRef}
              id="auth-name"
              type="text"
              required
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'auth-form-error' : undefined}
              placeholder="Alex Rivera"
              className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-ink">
            Email address
          </label>
          <input
            ref={emailInputRef}
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'auth-form-error' : undefined}
            placeholder="you@example.com"
            className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="auth-password" className="text-sm font-medium text-ink">
              Password
            </label>
            {mode === 'signin' && (
              <Link
                to={resetPasswordHref}
                className="text-xs font-medium text-pine underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative mt-1.5">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'auth-form-error' : undefined}
              placeholder="At least 8 characters"
              className="h-10 w-full rounded-md border border-hairline bg-surface pl-3 pr-10 text-sm text-ink placeholder:text-[#6B6660]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              {showPassword ? (
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
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine px-4 text-sm font-medium text-white transition-colors hover:bg-pine-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingProvider === 'email' && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
          {submittingProvider === 'email'
            ? mode === 'signin'
              ? 'Signing in...'
              : 'Creating account...'
            : mode === 'signin'
              ? 'Sign in with email'
              : 'Create account'}
        </button>
      </form>
    </section>
  );
}
