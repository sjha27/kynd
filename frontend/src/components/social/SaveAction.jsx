import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { saveOpportunity, unsaveOpportunity } from '../../api/client';

/*
 * Save is a private bookmark, not participation: it changes no counts, no
 * capacity, and nothing anyone else can see. Kept visually quieter than Join
 * for exactly that reason.
 *
 * Optimistic, because the write is idempotent in both directions and the
 * only meaningful failure is a lost connection — in which case the previous
 * state is restored.
 */
function SaveAction({ opportunity, onChange, variant = 'icon' }) {
  const [saved, setSaved] = useState(opportunity.viewerSaved === true);
  const [pending, setPending] = useState(false);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      if (next) await saveOpportunity(opportunity.id);
      else await unsaveOpportunity(opportunity.id);
      onChange?.(next);
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  };

  const label = saved ? 'Saved' : 'Save';

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control border px-4 text-sm font-medium transition-colors ${
          saved
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
        }`}
      >
        <Bookmark
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          fill={saved ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={saved}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)] transition-colors hover:bg-surface"
    >
      <Bookmark
        className={`h-[17px] w-[17px] ${saved ? 'text-brand' : 'text-ink-muted'}`}
        strokeWidth={2}
        fill={saved ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  );
}

export default SaveAction;
