import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { MapPin, Clock, BadgeCheck } from 'lucide-react';
import Photo from '../ui/Photo';
import SaveAction from '../social/SaveAction';
import Avatar from '../ui/Avatar';
import OrgMark from '../ui/OrgMark';
import AttendeeStack from './AttendeeStack';
import { opportunityImage, avatarImage } from '../../lib/media';
import { causeColor } from '../../lib/causes';
import { formatWhen, formatDuration, formatLocation, isScarce } from '../../lib/format';
import { cardVariants, SPRING, TRANSITION } from '../../lib/motion';

/*
 * The decision unit of Discover. Ordered to answer, in order: what is it,
 * when, where, how long, who is involved.
 *
 * The whole card is one link — no redundant "View" button competing with
 * it — which also keeps it a single tab stop.
 *
 * Join is deliberately absent — the journey stays card -> detail -> Join.
 * Save is here because a bookmark is a browsing decision, not a commitment.
 */
function OpportunityCard({ opportunity, className = '', onSaveChange }) {
  const { title, cause, host, timing, location, participants, capacity } = opportunity;
  const image = opportunityImage(opportunity);
  const scarce = isScarce({ available: participants.available, capacity });
  const full = participants.available === 0;

  const reduced = useReducedMotion();
  const variants = cardVariants(reduced);

  return (
    <Link
      to={`/opportunities/${opportunity.id}`}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      {/*
        The card is a single motion object: `hover`/`press` are declared
        here and propagate to the image child, so the photograph and the
        card lift together instead of animating independently.

        `whileFocus` is not used — the link, not the article, owns focus,
        and the focus ring already communicates it.
      */}
      <motion.article
        initial="rest"
        animate="rest"
        whileHover="hover"
        whileTap="press"
        variants={variants.card}
        transition={SPRING.lift}
        className={`flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[0_6px_20px_rgba(31,27,24,0.08)] ${className}`}
      >
        {/* Outer mask stays still so the scaling image can never spill past
            the card's rounded corner. */}
        <div className="relative overflow-hidden">
          <motion.div variants={variants.image} transition={TRANSITION.standard}>
            <Photo src={image} alt="" ratio="16/9" />
          </motion.div>
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
            style={{ backgroundColor: `color-mix(in srgb, ${causeColor(cause.name)} 88%, black)` }}
          >
            {cause.name}
          </span>
          {/* Save sits on the photo, the one place a bookmark belongs on a
              card: reachable while browsing without competing with the
              card's own tap target. */}
          <div className="absolute right-3 top-3">
            <SaveAction opportunity={opportunity} onChange={onSaveChange} />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {title}
          </h3>

          <div className="mt-2 flex items-center gap-2">
            {host.type === 'organization' ? (
              <OrgMark name={host.name} causeName={cause.name} size="xs" />
            ) : (
              <Avatar name={host.name} src={avatarImage(host)} size="xs" />
            )}
            <span className="min-w-0 truncate text-[13px] text-ink-muted">{host.name}</span>
            {host.verified && (
              <BadgeCheck
                className="h-3.5 w-3.5 flex-shrink-0 text-cause-blue"
                aria-label="Verified organization"
              />
            )}
          </div>

          <p className="mt-3 text-[14px] font-medium text-ink">{formatWhen(timing.startsAt)}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {formatLocation(location)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDuration(timing.durationMinutes)}
            </span>
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-3.5">
            <AttendeeStack participants={participants} className="min-w-0" />

            {/* Capacity is a real derived number. It only gains emphasis
                when genuinely scarce — never a countdown or a fake alarm. */}
            <span
              className={`flex-shrink-0 text-[12px] font-semibold ${
                full ? 'text-ink-subtle' : scarce ? 'text-accent' : 'text-ink-muted'
              }`}
            >
              {full
                ? 'Full'
                : scarce
                  ? `${participants.available} spots left`
                  : `${participants.available} of ${capacity} open`}
            </span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}

export default OpportunityCard;
