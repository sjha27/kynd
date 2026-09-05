import { Link } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import Photo from '../ui/Photo';
import { avatarImage } from '../../lib/media';

// occurred_on is a plain DATE, not a timestamp — a short "Aug 23" reads
// correctly regardless of viewer timezone, unlike reusing the timed
// opportunity formatters which would imply a time of day that isn't real.
function formatActivityDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/*
 * Renders only fields the activity row actually has. hours/organization/
 * cause/story are each conditionally shown rather than padded with a
 * placeholder — an activity with no story just doesn't show one.
 */
function ActivityFeedItem({ item }) {
  const { person, activity, header } = item;

  return (
    <li className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <Link
        to={`/users/${person.id}`}
        className="mb-3 flex w-fit items-center gap-2.5 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Avatar name={person.name} src={avatarImage(person)} size="sm" />
        <span className="text-[14px] font-semibold text-ink">{header}</span>
      </Link>

      <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
        {activity.imageUrl && (
          <Photo
            src={activity.imageUrl}
            alt=""
            ratio="square"
            className="w-20 flex-shrink-0 rounded-xl"
          />
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{activity.title}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            {formatActivityDate(activity.occurredOn)}
            {activity.hours ? ` · ${activity.hours} ${activity.hours === 1 ? 'hour' : 'hours'}` : ''}
            {activity.organizationName ? ` · ${activity.organizationName}` : ''}
          </p>
          {activity.causeName && (
            <p className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
              {activity.causeName}
            </p>
          )}
          {activity.story && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{activity.story}</p>
          )}
        </div>
      </div>
    </li>
  );
}

export default ActivityFeedItem;
