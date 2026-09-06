import Photo from '../ui/Photo';
import { formatCalendarDate } from '../../lib/format';

// occurred_on is a calendar date; formatCalendarDate renders it without
// timezone conversion, so the day shown is always the day stored.
function formatActivityDate(dateStr) {
  return formatCalendarDate(dateStr, { month: 'short', day: 'numeric', year: 'numeric' });
}

/*
 * Renders only fields the activity actually has — hours/host/cause/story
 * are each conditional rather than padded with a placeholder.
 */
function CompletedActivityCard({ activity }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
      {activity.imageUrl && (
        <div className="w-20 flex-shrink-0">
          <Photo src={activity.imageUrl} alt="" ratio="square" className="rounded-xl" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">{activity.title}</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          {formatActivityDate(activity.occurredOn)}
          {activity.hours ? ` · ${activity.hours} ${activity.hours === 1 ? 'hour' : 'hours'}` : ''}
          {activity.host ? ` · ${activity.host.name}` : ''}
        </p>
        {/* Self-reported contribution from outside Kynd is labelled as such
            rather than presented as a Kynd-hosted activity. */}
        {activity.source === 'manual' && (
          <p className="mt-1.5 text-[12px] font-medium text-ink-subtle">Logged by you</p>
        )}
        {activity.cause?.name && (
          <p className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
            {activity.cause.name}
          </p>
        )}
        {activity.story && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{activity.story}</p>
        )}
      </div>
    </div>
  );
}

export default CompletedActivityCard;
