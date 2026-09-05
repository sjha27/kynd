import { useState } from 'react';
import { Check } from 'lucide-react';
import Button from '../ui/Button';
import { supportFundraiser } from '../../api/client';
import { formatMoney } from '../../lib/format';

/*
 * Simulated support.
 *
 * No card fields, no payment, no checkout — the visitor picks an amount and
 * Kynd records the support relationship. The form says so plainly rather
 * than dressing up as a real donation flow.
 *
 * Support is one-time per person, which is the schema's rule
 * (UNIQUE user_id, fundraiser_id) rather than a UI choice — so once
 * supported, this becomes a state, not a button that would be rejected.
 */
const PRESET_CENTS = [1000, 2500, 5000, 10000];

function SupportAction({ fundraiser, onSupported }) {
  const [amountCents, setAmountCents] = useState(2500);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (fundraiser.viewerSupported) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-sunken px-4 py-3.5">
        <Check className="h-[18px] w-[18px] text-brand" strokeWidth={2.5} aria-hidden="true" />
        <p className="text-[15px] font-semibold text-ink">You supported this fundraiser</p>
      </div>
    );
  }

  if (!fundraiser.canSupport) {
    return (
      <div className="rounded-2xl border border-line bg-surface-sunken px-4 py-3.5">
        <p className="text-[15px] font-semibold text-ink">
          {fundraiser.status !== 'active' ? 'This fundraiser was cancelled' : 'This fundraiser has ended'}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          It&rsquo;s no longer accepting support, but its progress stays part of the record.
        </p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await supportFundraiser(fundraiser.id, { amountCents });
      onSupported(res.fundraiser);
    } catch (err) {
      setError(
        err.code === 'fundraiser_already_supported'
          ? 'You have already supported this fundraiser.'
          : err.code === 'fundraiser_ended'
            ? 'This fundraiser has ended.'
            : err.code === 'fundraiser_not_supportable'
              ? 'This fundraiser is no longer accepting support.'
              : "We couldn't record that. Please try again."
      );
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[15px] font-semibold text-ink">Support this fundraiser</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESET_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            aria-pressed={amountCents === cents}
            onClick={() => setAmountCents(cents)}
            className={`min-h-[42px] min-w-[72px] rounded-control border px-3 text-[15px] font-semibold transition-colors ${
              amountCents === cents
                ? 'border-brand bg-brand text-white'
                : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            {formatMoney(cents)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : `Support with ${formatMoney(amountCents)}`}
        </Button>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-subtle">
        Simulated for this demo &mdash; no payment is processed and no card details are collected.
        Your support is recorded once, and only you can see it.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-[14px] text-accent">
          {error}
        </p>
      )}
    </form>
  );
}

export default SupportAction;
