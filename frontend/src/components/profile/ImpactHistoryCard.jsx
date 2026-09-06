import { Link } from 'react-router-dom';
import Photo from '../ui/Photo';
import { activityImage } from '../../lib/media';
import { causeColor } from '../../lib/causes';
import { formatCalendarDate } from '../../lib/format';

/*
 * One contribution, told as an entry in a history rather than a row in a
 * table. The photograph and the person's own words are what keep a profile
 * from reading as a volunteer-hours tracker.
 *
 * Kynd-originated participation links back to the opportunity it came from;
 * a manually logged contribution cannot, and says so plainly instead —
 * self-reported history is a first-class part of "Kynd is my contribution
 * history", but it should never be dressed up as something Kynd hosted.
 */
function ImpactHistoryCard({ activity }) {
  const image = activityImage(activity);
  const hostName = activity.host?.name;
  const hostHref =
    activity.host?.type === 'organization' && activity.host.id
      ? `/organizations/${activity.host.id}`
      : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface transition-shadow duration-200 hover:shadow-[0_4px_18px_rgba(31,27,24,0.07)]">
      {image && (
        <div className="relative">
          <Photo src={image} alt="" ratio="3/2" />
          {activity.cause?.name && (
            <span
              className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
              style={{
                backgroundColor: `color-mix(in srgb, ${causeColor(activity.cause.name)} 88%, black)`,
              }}
            >
              {activity.cause.name}
            </span>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Without a photo the cause still needs to carry its color, so it
            moves inline rather than disappearing. */}
        {!image && activity.cause?.name && (
          <span
            className="text-[11px] font-bold uppercase tracking-[0.07em]"
            style={{ color: causeColor(activity.cause.name) }}
          >
            {activity.cause.name}
          </span>
        )}

        {activity.opportunityId ? (
          <Link
            to={`/opportunities/${activity.opportunityId}`}
            className="mt-0.5 block text-[16px] font-semibold leading-snug text-ink hover:text-brand"
          >
            {activity.title}
          </Link>
        ) : (
          <h3 className="mt-0.5 text-[16px] font-semibold leading-snug text-ink">
            {activity.title}
          </h3>
        )}

        <p className="mt-1.5 text-[13px] text-ink-muted">
          {formatCalendarDate(activity.occurredOn, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {activity.hours ? ` · ${activity.hours} ${activity.hours === 1 ? 'hour' : 'hours'}` : ''}
        </p>

        {hostName && (
          <p className="mt-1 text-[13px] text-ink-muted">
            {hostHref ? (
              <Link to={hostHref} className="font-medium text-ink hover:text-brand">
                {hostName}
              </Link>
            ) : (
              <span className="font-medium text-ink">{hostName}</span>
            )}
            {activity.source === 'manual' && (
              <span className="text-ink-subtle"> &middot; Added manually</span>
            )}
          </p>
        )}

        {activity.story && (
          <p className="mt-2.5 text-[14px] leading-relaxed text-ink-muted">{activity.story}</p>
        )}
      </div>
    </article>
  );
}

export default ImpactHistoryCard;
