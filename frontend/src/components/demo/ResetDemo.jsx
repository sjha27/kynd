import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useDemoSession } from '../../session/DemoSessionProvider';

/*
 * Reset Demo.
 *
 * Deliberately quiet: this is demo scaffolding, not a Kynd product action,
 * so it reads as small grey text rather than a button competing with Join
 * or Create. It sits at the foot of the navigation, where a real product
 * would keep account settings.
 *
 * Confirmation is a required step because the action is irreversible — it
 * destroys everything the visitor has done — and a stray tap next to
 * primary navigation would otherwise wipe a demo mid-walkthrough. The
 * confirm copy names what is actually lost rather than saying "are you
 * sure".
 */
function ResetDemo({ className = '' }) {
  const { reset } = useDemoSession();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await reset();
      setConfirming(false);
      // Land on the clean starter experience, not on whatever page the
      // visitor happened to be looking at with now-deleted state.
      navigate('/');
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-subtle transition-colors hover:text-ink ${className}`}
      >
        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Reset demo
      </button>
    );
  }

  return (
    <div className={`rounded-xl border border-line bg-surface-sunken p-3 ${className}`}>
      <p className="text-[13px] font-semibold text-ink">Start over?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        This clears everything you&rsquo;ve done &mdash; joins, saves, activities, anything you
        created &mdash; and gives you a fresh account. The Kynd community itself is unchanged.
      </p>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="min-h-[32px] rounded-control bg-brand px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:bg-brand/35"
        >
          {pending ? 'Resetting…' : 'Reset'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(false);
          }}
          disabled={pending}
          className="text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-accent">
          That didn&rsquo;t work. Please try again.
        </p>
      )}
    </div>
  );
}

export default ResetDemo;
