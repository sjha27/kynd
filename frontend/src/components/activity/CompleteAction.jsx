import { useState } from 'react';
import Button from '../ui/Button';
import { completeOpportunity } from '../../api/client';

// Nearest half hour, so a 3-hour opportunity suggests exactly 3.
function suggestedHours(durationMinutes) {
  if (!durationMinutes) return '';
  return Math.round((durationMinutes / 60) * 2) / 2;
}

/*
 * Whether this opportunity's real end has passed is public, honest,
 * already-present data (timing.endsAt vs. the real clock) — no allowlist
 * needed for that half. Whether it ALSO qualifies for the early demo path
 * is authoritative only from the backend: `demoCompletionEligible` is
 * derived from the one allowlist in config/demo_completion.js and must
 * not be re-derived or duplicated here.
 */
function isEnded(opportunity) {
  return new Date(opportunity.timing.endsAt).getTime() < Date.now();
}

function CompleteAction({ opportunity, onCompleted }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(() => suggestedHours(opportunity.timing.durationMinutes));
  const [story, setStory] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const ended = isEnded(opportunity);
  const canComplete = ended || opportunity.demoCompletionEligible;

  // No completion control at all for a future opportunity outside the
  // explicit demo allowlist — showing one would be a dead UI action the
  // backend can only reject.
  if (!canComplete) return null;

  const label = ended ? 'Mark as complete' : 'Demo: Mark as complete';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-brand underline-offset-2 hover:underline"
      >
        {label}
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours) || numericHours <= 0) {
      setError('Enter a valid number of hours.');
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await completeOpportunity(opportunity.id, { hours: numericHours, story: story.trim() || null });
      onCompleted();
    } catch (err) {
      setError(
        err.code === 'activity_already_completed'
          ? 'This is already marked complete.'
          : err.code === 'opportunity_not_completable'
            ? "This opportunity can't be completed yet."
            : "We couldn't complete that. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full space-y-3 rounded-2xl border border-line bg-surface-sunken p-3.5"
    >
      <p className="text-[13px] font-semibold text-ink">
        {ended ? 'Did you participate?' : 'Demo: simulate completing this opportunity'}
      </p>

      <label className="block text-[12px] font-semibold text-ink-muted">
        Hours
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="mt-1 block w-24 rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] text-ink"
        />
      </label>

      <label className="block text-[12px] font-semibold text-ink-muted">
        Story (optional)
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={2}
          placeholder="How did it go?"
          className="mt-1 block w-full resize-none rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] text-ink"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add to Kynd'}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
    </form>
  );
}

export default CompleteAction;
