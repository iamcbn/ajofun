import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

export function formatOtpError(
  err: unknown,
  fallback = "That code didn't match. Try again.",
): string {
  const raw = err instanceof Error ? err.message.trim() : '';
  if (!raw) return fallback;
  if (/^(invalid\s*otp|invalid_otp|invalid\s+verification\s+code\.?)$/i.test(raw)) {
    return "That code didn't match. Try again.";
  }
  if (/expired/i.test(raw)) {
    return 'That code has expired. Request a new one.';
  }
  if (/too\s+many|rate\s+limit|attempts/i.test(raw)) {
    return 'Too many attempts. Request a new code.';
  }
  return raw;
}

export interface OtpCodeInputProps {
  idPrefix: string;
  value: string;
  onChange: (nextValue: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  isVerifying?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
  errorTrigger?: number;
  isVerified?: boolean;
  groupLabel?: string;
  describedBy?: string;
}

export function OtpCodeInput({
  idPrefix,
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  isVerifying = false,
  autoFocus = false,
  hasError = false,
  errorTrigger = 0,
  isVerified = false,
  groupLabel = '6-digit verification code',
  describedBy,
}: OtpCodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const completeTimerRef = useRef<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const normalized = value.replace(/\D/g, '').slice(0, length);
  const normalizedLengthRef = useRef(normalized.length);
  normalizedLengthRef.current = normalized.length;
  const cells = Array.from({ length }, (_, index) => normalized[index] ?? '');

  const clearCompleteTimer = () => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return clearCompleteTimer;
  }, []);

  useEffect(() => {
    if (disabled) {
      clearCompleteTimer();
    }
  }, [disabled]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const rafId = window.requestAnimationFrame(() => {
      const targetIndex = Math.min(normalizedLengthRef.current, length - 1);
      inputRefs.current[targetIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [autoFocus, disabled, length]);

  const focusSlot = (index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[clamped]?.focus();
  };

  const applyCharAt = (targetIndex: number, char: string) => {
    clearCompleteTimer();
    const wasIncomplete = normalized.length < length;
    const chars = normalized.split('');
    if (targetIndex < chars.length) {
      chars[targetIndex] = char;
    } else {
      chars.push(char);
    }
    const next = chars.join('').slice(0, length);
    onChange(next);
    focusSlot(Math.min(targetIndex + 1, length - 1));
    if (!disabled && next.length === length) {
      if (wasIncomplete || targetIndex === length - 1) {
        onComplete?.(next);
      } else {
        completeTimerRef.current = window.setTimeout(() => {
          completeTimerRef.current = null;
          onComplete?.(next);
        }, 450);
      }
    }
  };

  const removeCharAt = (targetIndex: number) => {
    clearCompleteTimer();
    if (targetIndex < 0 || targetIndex >= normalized.length) return;
    const chars = normalized.split('');
    chars.splice(targetIndex, 1);
    onChange(chars.join(''));
  };

  const applyMultiDigits = (startIndex: number, digits: string) => {
    clearCompleteTimer();
    if (!digits) return;
    const wasIncomplete = normalized.length < length;
    if (digits.length >= length) {
      const next = digits.slice(0, length);
      onChange(next);
      focusSlot(length - 1);
      if (!disabled) {
        onComplete?.(next);
      }
      return;
    }

    const clampedStart = Math.min(startIndex, normalized.length);
    const chars = normalized.split('');
    for (let i = 0; i < digits.length && clampedStart + i < length; i += 1) {
      if (clampedStart + i < chars.length) {
        chars[clampedStart + i] = digits[i];
      } else {
        chars.push(digits[i]);
      }
    }
    const next = chars.join('').slice(0, length);
    onChange(next);
    focusSlot(Math.min(clampedStart + digits.length, length - 1));
    const reachedEnd = clampedStart + digits.length >= length;
    if (!disabled && next.length === length && (wasIncomplete || reachedEnd)) {
      onComplete?.(next);
    }
  };

  const handleChange = (index: number, rawValue: string, currentDigit: string) => {
    const clean = rawValue.replace(/\D/g, '');
    if (clean.length === 0) {
      removeCharAt(index);
      return;
    }

    if (clean.length === 1) {
      const target = Math.min(index, normalized.length);
      applyCharAt(target, clean);
      return;
    }

    if (clean.length === 2 && currentDigit) {
      const nextChar = clean[0] === currentDigit ? clean[1] : clean[0];
      applyCharAt(Math.min(index, normalized.length), nextChar);
      return;
    }

    applyMultiDigits(index, clean);
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (disabled) return;
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    applyMultiDigits(index, pasted);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (cells[index]) {
        removeCharAt(index);
        focusSlot(index);
      } else if (index > 0) {
        removeCharAt(index - 1);
        focusSlot(index - 1);
      }
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      if (cells[index]) {
        removeCharAt(index);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusSlot(index - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusSlot(index + 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusSlot(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusSlot(Math.min(normalized.length, length - 1));
    }
  };

  const handleClick = (index: number) => {
    if (disabled) return;
    if (!cells[index] && index > normalized.length) {
      focusSlot(normalized.length);
    }
  };

  const shakeClass =
    hasError && errorTrigger > 0
      ? errorTrigger % 2 === 1
        ? 'otp-error-shake-a'
        : 'otp-error-shake-b'
      : '';

  const errorHaloClass =
    hasError && errorTrigger > 0
      ? errorTrigger % 2 === 1
        ? 'otp-error-halo-a'
        : 'otp-error-halo-b'
      : 'shadow-[0_0_0_1px_rgba(155,44,44,0.12)]';

  return (
    <div
      role="group"
      aria-label={groupLabel}
      aria-describedby={describedBy}
      className={`flex w-full items-center gap-1.5 sm:gap-2 ${shakeClass}`}
    >
      {cells.map((digit, index) => {
        const isFocused = focusedIndex === index && !disabled;

        let cellStateClass =
          'border-hairline bg-paper/65 text-ink hover:border-ink-muted/45';
        if (hasError) {
          cellStateClass = `border-seal bg-[#FFF9F9] text-seal ${errorHaloClass}`;
        } else if (isVerified) {
          cellStateClass = 'border-pine bg-pine/[0.06] text-pine otp-success-pop';
        } else if (isVerifying) {
          cellStateClass = 'border-pine/55 bg-pine/[0.03] text-ink';
        } else if (isFocused) {
          cellStateClass =
            'border-pine bg-surface text-ink -translate-y-[1px] shadow-[0_0_0_3px_rgba(31,78,61,0.10)]';
        } else if (digit) {
          cellStateClass = 'border-ink/25 bg-surface text-ink';
        }

        const showMiddleGroupGap = length === 6 && index === 2;

        return (
          <div key={index} className="contents">
            <div
              style={isVerified ? { animationDelay: `${index * 35}ms` } : undefined}
              className={`relative flex h-12 flex-1 items-center justify-center overflow-hidden rounded-lg border transition-all duration-200 sm:h-[54px] ${cellStateClass} ${
                disabled && !isVerifying && !isVerified ? 'opacity-65' : ''
              }`}
            >
              {hasError ? (
                <span
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 55}ms` }}
                  className="otp-error-shimmer pointer-events-none absolute inset-0"
                />
              ) : isVerifying ? (
                <span
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 55}ms` }}
                  className="otp-verifying-shimmer pointer-events-none absolute inset-0"
                />
              ) : null}

              {digit ? (
                <span
                  key={`${index}-${digit}`}
                  aria-hidden="true"
                  className="otp-digit-pop relative z-[1] select-none font-mono text-xl font-semibold tabular-nums"
                >
                  {digit}
                </span>
              ) : isFocused ? (
                <span
                  aria-hidden="true"
                  className={`otp-caret-blink relative z-[1] h-5 w-[1.75px] rounded-full ${
                    hasError ? 'bg-seal' : 'bg-pine'
                  }`}
                />
              ) : null}

              <input
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                id={`${idPrefix}-${index}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={length}
                value={digit}
                disabled={disabled}
                aria-label={`Digit ${index + 1} of ${length}`}
                aria-invalid={hasError ? 'true' : undefined}
                onFocus={(event) => {
                  setFocusedIndex(index);
                  event.currentTarget.select();
                }}
                onBlur={() => {
                  setFocusedIndex((prev) => (prev === index ? null : prev));
                }}
                onClick={() => handleClick(index)}
                onPaste={(event) => handlePaste(index, event)}
                onChange={(event) => handleChange(index, event.target.value, digit)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                className="otp-cell-input absolute inset-0 z-10 h-full w-full cursor-text rounded-[inherit] bg-transparent text-center font-mono text-xl text-transparent caret-transparent selection:bg-transparent focus:outline-none"
              />
            </div>

            {showMiddleGroupGap && (
              <span aria-hidden="true" className="w-1.5 shrink-0 sm:w-2.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}
