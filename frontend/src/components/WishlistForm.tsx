import { useState, type FormEvent } from 'react';
import { PlusIcon, SpinnerIcon, TrashIcon } from './Icons';
import type { WishlistItem } from '../types/database';
import { validateExternalUrl } from '../lib/validation';

interface WishlistFormValues {
  display_name: string;
  alias?: string;
  wishlist_items: WishlistItem[];
  dislikes: string;
  delivery_notes: string;
}

interface WishlistFormProps {
  initialValues: WishlistFormValues;
  lockDisplayName?: boolean;
  submitLabel: string;
  submittingLabel?: string;
  submitting?: boolean;
  onCancel?: () => void;
  onSubmit: (values: WishlistFormValues) => Promise<void> | void;
}

interface DraftItem {
  id: string;
  title: string;
  url: string;
  notes: string;
}

let draftItemSeq = 0;
function nextDraftItemId(): string {
  draftItemSeq += 1;
  return `wish-draft-${draftItemSeq}`;
}

export function WishlistForm({
  initialValues,
  lockDisplayName = false,
  submitLabel,
  submittingLabel = 'Saving...',
  submitting = false,
  onCancel,
  onSubmit,
}: WishlistFormProps) {
  const isNameLocked = Boolean(lockDisplayName && initialValues.display_name.trim());
  const [displayName, setDisplayName] = useState(initialValues.display_name);
  const [alias, setAlias] = useState(initialValues.alias ?? '');
  const [showNicknameInput, setShowNicknameInput] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(() =>
    initialValues.wishlist_items.length > 0
      ? initialValues.wishlist_items.map((item) => ({
          id: nextDraftItemId(),
          title: item.title,
          url: item.url ?? '',
          notes: item.notes ?? '',
        }))
      : [{ id: nextDraftItemId(), title: '', url: '', notes: '' }],
  );
  const [dislikes, setDislikes] = useState(initialValues.dislikes);
  const [deliveryNotes, setDeliveryNotes] = useState(initialValues.delivery_notes);
  const [error, setError] = useState<string | null>(null);

  const handleAddItem = () => {
    if (items.length >= 20) return;
    setItems((prev) => [...prev, { id: nextDraftItemId(), title: '', url: '', notes: '' }]);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        return [{ id: nextDraftItemId(), title: '', url: '', notes: '' }];
      }
      return prev.filter((item) => item.id !== itemId);
    });
  };

  const handleItemChange = (itemId: string, field: keyof Omit<DraftItem, 'id'>, value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedName = (isNameLocked ? initialValues.display_name : displayName).trim();
    if (!trimmedName) {
      setError('Please enter the display name others in this group know you by.');
      return;
    }

    let cleanedAlias = alias.trim().slice(0, 40);
    if (cleanedAlias.toLowerCase() === trimmedName.toLowerCase()) {
      cleanedAlias = '';
    }

    const cleanedItems: WishlistItem[] = [];
    try {
      for (const draft of items) {
        const title = draft.title.trim();
        const urlInput = draft.url.trim();
        const notes = draft.notes.trim();

        if (!title && !urlInput && !notes) {
          continue;
        }
        if (!title) {
          setError('Each wishlist entry needs an item title.');
          return;
        }
        const safeUrl = validateExternalUrl(urlInput);
        cleanedItems.push({
          title,
          url: safeUrl,
          notes,
        });
      }
    } catch (validationErr) {
      setError(validationErr instanceof Error ? validationErr.message : 'Invalid link URL.');
      return;
    }

    try {
      await onSubmit({
        display_name: trimmedName,
        alias: cleanedAlias,
        wishlist_items: cleanedItems,
        dislikes: dislikes.trim(),
        delivery_notes: deliveryNotes.trim(),
      });
    } catch (submitErr) {
      setError(submitErr instanceof Error ? submitErr.message : 'Could not save your wishlist.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-seal/30 bg-seal/5 px-4 py-3 text-sm text-seal"
        >
          {error}
        </div>
      )}

      {isNameLocked ? (
        <div className="space-y-2.5 border-b border-hairline pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-muted">
              Participating as <strong className="font-medium text-ink">{initialValues.display_name}</strong>
              {!showNicknameInput && alias.trim() && (
                <span className="ml-1.5 text-xs text-ink-muted">({alias.trim()})</span>
              )}
            </p>
            {!showNicknameInput && (
              <button
                type="button"
                onClick={() => setShowNicknameInput(true)}
                className="text-xs font-medium text-pine underline-offset-2 hover:underline"
              >
                {alias.trim() ? 'Edit nickname' : '+ Add nickname'}
              </button>
            )}
          </div>
          {showNicknameInput && (
            <div className="max-w-sm space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="wishlist-alias" className="text-xs font-medium text-ink">
                  Nickname or alias <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNicknameInput(false)}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Done
                </button>
              </div>
              <input
                id="wishlist-alias"
                type="text"
                maxLength={40}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Shown beside your real name"
                className="h-9 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wishlist-display-name" className="block text-sm font-medium text-ink">
              Your name
            </label>
            <input
              id="wishlist-display-name"
              type="text"
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Maya Patel"
              className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="wishlist-alias" className="text-sm font-medium text-ink">
                Nickname or alias
              </label>
              <span className="text-xs text-ink-muted">Optional</span>
            </div>
            <input
              id="wishlist-alias"
              type="text"
              maxLength={40}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Shown beside your real name"
              className="mt-1.5 h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
            />
          </div>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Gift ideas</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            Leave blank if you&apos;re open to surprises. Up to 20 ideas.
          </p>
          {items.length < 20 && (
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
            >
              <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Add idea
            </button>
          )}
        </div>

        <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-subtle/40">
          {items.map((item, idx) => (
            <div key={item.id} className="space-y-2.5 p-3.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`wish-title-${item.id}`} className="sr-only">
                    Gift idea {idx + 1}
                  </label>
                  <input
                    id={`wish-title-${item.id}`}
                    type="text"
                    maxLength={120}
                    value={item.title}
                    onChange={(e) => handleItemChange(item.id, 'title', e.target.value)}
                    placeholder={`Gift idea ${idx + 1} (e.g. Whole bean espresso, ceramic mug)`}
                    className="h-10 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-[#6B6660]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  aria-label={`Remove gift idea ${idx + 1}`}
                  className="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface hover:text-seal"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={`wish-url-${item.id}`} className="sr-only">
                    Optional link for idea {idx + 1}
                  </label>
                  <input
                    id={`wish-url-${item.id}`}
                    type="url"
                    maxLength={500}
                    value={item.url}
                    onChange={(e) => handleItemChange(item.id, 'url', e.target.value)}
                    placeholder="Link (https://...)"
                    className="h-9 w-full rounded-md border border-hairline bg-surface px-3 text-xs text-ink placeholder:text-[#6B6660]"
                  />
                </div>
                <div>
                  <label htmlFor={`wish-notes-${item.id}`} className="sr-only">
                    Size, color, or note for idea {idx + 1}
                  </label>
                  <input
                    id={`wish-notes-${item.id}`}
                    type="text"
                    maxLength={280}
                    value={item.notes}
                    onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                    placeholder="Size, color, or note"
                    className="h-9 w-full rounded-md border border-hairline bg-surface px-3 text-xs text-ink placeholder:text-[#6B6660]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="wishlist-dislikes" className="text-sm font-medium text-ink">
              Dislikes or allergies
            </label>
            <span className="text-xs text-ink-muted">Optional</span>
          </div>
          <textarea
            id="wishlist-dislikes"
            rows={2}
            maxLength={500}
            value={dislikes}
            onChange={(e) => setDislikes(e.target.value)}
            placeholder="e.g. No peanuts, strong scents, or novelty socks"
            className="mt-1.5 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-[#6B6660]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="wishlist-delivery" className="text-sm font-medium text-ink">
              Delivery or handoff note
            </label>
            <span className="text-xs text-ink-muted">Optional</span>
          </div>
          <textarea
            id="wishlist-delivery"
            rows={2}
            maxLength={500}
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="e.g. Leave at 3rd floor desk, or shipping address"
            className="mt-1.5 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-[#6B6660]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-pine px-5 text-sm font-medium text-white transition-colors hover:bg-pine-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <SpinnerIcon className="h-4 w-4" aria-hidden="true" />}
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
