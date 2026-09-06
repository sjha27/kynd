import { formatMoney } from '../../lib/format';

/*
 * Four objective facts, given deliberately equal weight.
 *
 * Kynd shows history, not virtue: there is no score, no ranking, no
 * percentile, and Hours is not allowed to become a dominant hero number
 * that turns a person's contribution into a leaderboard entry. Every value
 * is derived by the backend from real relationships.
 */
const METRICS = [
  { key: 'hours', label: 'Hours' },
  { key: 'activities', label: 'Activities' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'amountRaisedCents', label: 'Raised' },
];

function value(key, raw) {
  if (key === 'amountRaisedCents') return formatMoney(raw);
  // Hours can be fractional (a 2.5 hour shift); the others never are.
  return Number(raw).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function ProfileMetrics({ metrics, className = '' }) {
  return (
    <dl className={`grid grid-cols-2 gap-2.5 xl:grid-cols-2 ${className}`}>
      {METRICS.map(({ key, label }) => (
        <div key={key} className="rounded-2xl border border-line bg-surface-sunken px-4 py-3.5">
          <dd className="text-[22px] font-bold leading-none tracking-[-0.02em] text-ink">
            {value(key, metrics[key])}
          </dd>
          <dt className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

export default ProfileMetrics;
