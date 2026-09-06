import { useState } from 'react';
import { leaveOpportunity } from '../../api/client';

/*
 * Leaving an opportunity.
 *
 * Deliberately low-emphasis and behind a confirmation: the Joined state is
 * the thing worth showing, and dropping out should never be a stray tap
 * next to it. The confirmation asks the actual question rather than a
 * generic "are you sure".
 *
 * Everything it reports comes back from the server — the caller applies the
 * derived participant count and available spots the backend returned, never
 * numbers guessed in the browser.
 */
function LeaveAction({ opportunity, onLeft, className = '' }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onLeft(await leaveOpportunity(opportunity.id));
      setConfirming(false);
    } catch (err) {
      setError(
        err.code === 'opportunity_already_completed'
          ? "This is part of your history now and can't be left."
          : "We couldn't do that. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`text-[13px] font-medium text-ink-subtle underline-offset-2 transition-colors hover:text-ink hover:underline ${className}`}
      >
        Leave
      </button>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-2.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink">Leave this opportunity?</span>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-[13px] font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-60"
      >
        {pending ? 'Leaving…' : 'Yes, leave'}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
        className="text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        Cancel
      </button>
      {error && (
        <span role="alert" className="w-full text-[13px] text-accent">
          {error}
        </span>
      )}
    </span>
  );
}

export default LeaveAction;
