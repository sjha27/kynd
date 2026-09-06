import { Link } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import Photo from '../ui/Photo';
import { avatarImage } from '../../lib/media';
import { formatCalendarDate } from '../../lib/format';
import EngagementBar from '../social/EngagementBar';

// occurred_on is a plain DATE, not a timestamp — a short "Aug 23" reads
// correctly regardless of viewer timezone, unlike reusing the timed
// opportunity formatters which would imply a time of day that isn't real.
function formatActivityDate(dateStr) {
  return formatCalendarDate(dateStr);
}

/*
 * Renders only fields the activity row actually has. hours/organization/
 * cause/story are each conditionally shown rather than padded with a
 * placeholder — an activity with no story just doesn't show one.
 */
function ActivityFeedItem({ item }) {
  const { person, activity, header, context } = item;

  return (
    <li className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <Link
        to={`/users/${person.id}`}
        className="flex w-fit items-center gap-2.5 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Avatar name={person.name} src={avatarImage(person)} size="sm" />
        <span className="text-[14px] font-semibold text-ink">{header}</span>
      </Link>

      {/* Second-degree attribution: why this person, whom you don't follow,
          is in your feed at all. Naming the real follower who reacted is
          what keeps this discovery understandable instead of arbitrary. */}
      {context && <p className="ml-[42px] mt-0.5 text-[13px] text-ink-subtle">{context}</p>}

      <div className="mb-3" />

      <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
        {/* The width lives on the wrapper below: Photo's own w-full would
            otherwise win the utility-ordering tie and blow the thumbnail up
            to the full card width. */}
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

      {/* An activity is the object Kynd's social layer is really about —
          someone's real contribution — so this is where reacting and
          commenting belong most naturally. */}
      <EngagementBar
        targetType="activities"
        targetId={activity.id}
        shareTitle={activity.title}
        className="mt-3"
      />
    </li>
  );
}

export default ActivityFeedItem;
