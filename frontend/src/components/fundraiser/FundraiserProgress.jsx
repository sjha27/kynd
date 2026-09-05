import { formatMoney, daysRemaining } from '../../lib/format';
import { causeColor } from '../../lib/causes';

/*
 * A fundraiser's progress, stated plainly.
 *
 * Every number here is derived by the backend from real support
 * relationships — nothing is a stored total and nothing is invented in the
 * browser. The bar is capped at 100% while the amounts stay exact, so an
 * over-funded fundraiser reads honestly instead of overflowing its track.
 */
function FundraiserProgress({ fundraiser, size = 'md' }) {
  const { amountRaisedCents, goalAmountCents, supporterCount, progressPercent } = fundraiser;
  const left = daysRemaining(fundraiser.endDate);
  const large = size === 'lg';

  const timing = fundraiser.isEnded
    ? 'Ended'
    : left === 0
      ? 'Ends today'
      : left === 1
        ? '1 day left'
        : `${left} days left`;

  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressPercent}% of goal raised`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: causeColor(fundraiser.cause?.name),
          }}
        />
      </div>

      <p className={`mt-2 ${large ? 'text-[17px]' : 'text-[14px]'} text-ink-muted`}>
        <strong className={`font-bold text-ink ${large ? 'text-[22px]' : ''}`}>
          {formatMoney(amountRaisedCents)}
        </strong>{' '}
        raised of {formatMoney(goalAmountCents)}
      </p>
      <p className="mt-0.5 text-[13px] text-ink-subtle">
        {supporterCount.toLocaleString('en-US')}{' '}
        {supporterCount === 1 ? 'supporter' : 'supporters'} &middot; {timing}
      </p>
    </div>
  );
}

export default FundraiserProgress;
