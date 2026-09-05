import Avatar from '../ui/Avatar';
import { formatAttendees } from '../../lib/format';
import { avatarImage } from '../../lib/media';

/*
 * Social proof, non-personalized.
 *
 * Shows who is actually registered — real relational data — as a small
 * overlapping avatar stack plus a sentence. The sentence carries the whole
 * meaning on its own, so the avatars are decorative and hidden from
 * assistive tech rather than repeating every name.
 *
 * Deliberately NOT "people you follow": there is no visitor identity yet,
 * and inventing one would fabricate friendships.
 */
function AttendeeStack({ participants, size = 'xs', className = '' }) {
  const label = formatAttendees(participants);
  if (!label) return null;

  const preview = participants?.preview ?? [];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {preview.length > 0 && (
        <div className="flex -space-x-1.5" aria-hidden="true">
          {preview.map((person) => (
            <Avatar
              key={person.id}
              name={person.name}
              src={avatarImage(person)}
              size={size}
              className="ring-2 ring-surface"
            />
          ))}
        </div>
      )}
      <span className="min-w-0 truncate text-[13px] text-ink-muted">{label}</span>
    </div>
  );
}

export default AttendeeStack;
