import { useState, type FormEvent } from 'react';
import { SpinnerIcon, TrashIcon, UserXIcon } from './Icons';
import type { Exclusion, Participant } from '../types/database';
import { formatParticipantName } from '../lib/validation';

interface ExclusionsPanelProps {
  participants: Participant[];
  exclusions: Exclusion[];
  onAddExclusion: (giverId: string, excludedId: string, mutual: boolean) => Promise<void>;
  onRemoveExclusion: (exclusionId: string) => Promise<void>;
}

export function ExclusionsPanel({
  participants,
  exclusions,
  onAddExclusion,
  onRemoveExclusion,
}: ExclusionsPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [giverId, setGiverId] = useState('');
  const [excludedId, setExcludedId] = useState('');
  const [mutual, setMutual] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(
    participants.map((p) => [p.id, formatParticipantName(p.display_name, p.alias)]),
  );

  const canAddRules = participants.length >= 2;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!giverId || !excludedId) {
      setError('Select both people to add an exclusion rule.');
      return;
    }
    if (giverId === excludedId) {
      setError('People automatically cannot draw themselves.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddExclusion(giverId, excludedId, mutual);
      setGiverId('');
      setExcludedId('');
    } catch (addErr) {
      setError(addErr instanceof Error ? addErr.message : 'Could not add exclusion rule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (exclusionId: string) => {
    setError(null);
    setRemovingId(exclusionId);
    try {
      await onRemoveExclusion(exclusionId);
    } catch (rmErr) {
      setError(rmErr instanceof Error ? rmErr.message : 'Could not remove exclusion rule.');
    } finally {
      setRemovingId((curr) => (curr === exclusionId ? null : curr));
    }
  };

  return (
    <section className="rounded-xl border border-hairline bg-surface p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Exclusion rules
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {exclusions.length > 0
              ? `${exclusions.length} active ${exclusions.length === 1 ? 'rule' : 'rules'} — kept separate during the draw.`
              : canAddRules
                ? 'Optional — keep partners or housemates from drawing each other.'
                : 'Optional — available once at least two participants join.'}
          </p>
        </div>

        {canAddRules && (
          <button
            type="button"
            aria-expanded={isAdding}
            onClick={() => {
              setError(null);
              setIsAdding((prev) => !prev);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-subtle/60 px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
          >
            {isAdding ? 'Close' : '+ Add rule'}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-seal/30 bg-seal/5 px-3 py-2 text-xs text-seal"
        >
          {error}
        </div>
      )}

      {canAddRules && isAdding && (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-hairline pt-4">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <label htmlFor="excl-giver" className="sr-only">
                Person A
              </label>
              <select
                id="excl-giver"
                value={giverId}
                onChange={(e) => setGiverId(e.target.value)}
                className="h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink"
              >
                <option value="">Select person...</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatParticipantName(p.display_name, p.alias)}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-center text-xs font-medium text-ink-muted">
              cannot draw
            </span>

            <div>
              <label htmlFor="excl-target" className="sr-only">
                Person B
              </label>
              <select
                id="excl-target"
                value={excludedId}
                onChange={(e) => setExcludedId(e.target.value)}
                className="h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink"
              >
                <option value="">Select person...</option>
                {participants
                  .filter((p) => p.id !== giverId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatParticipantName(p.display_name, p.alias)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={mutual}
                onChange={(e) => setMutual(e.target.checked)}
                className="h-4 w-4 rounded border-hairline accent-pine"
              />
              Make mutual (neither can draw the other)
            </label>

            <button
              type="submit"
              disabled={submitting || !giverId || !excludedId}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-subtle px-3.5 text-xs font-medium text-ink transition-colors hover:bg-hairline/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <SpinnerIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <UserXIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {submitting ? 'Adding...' : 'Add rule'}
            </button>
          </div>
        </form>
      )}

      {exclusions.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline pt-1">
          {exclusions.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink">
                <strong>{nameById.get(rule.giver_participant_id) ?? 'Unknown'}</strong> cannot draw{' '}
                <strong>{nameById.get(rule.excluded_participant_id) ?? 'Unknown'}</strong>
              </span>
              <button
                type="button"
                disabled={removingId === rule.id}
                onClick={() => void handleRemove(rule.id)}
                aria-label="Remove exclusion rule"
                className="rounded p-1 text-ink-muted hover:bg-surface-subtle hover:text-seal disabled:opacity-60"
              >
                {removingId === rule.id ? (
                  <SpinnerIcon className="h-4 w-4 text-seal" aria-hidden="true" />
                ) : (
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
