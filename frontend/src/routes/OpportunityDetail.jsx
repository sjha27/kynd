import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, MapPin, Clock, CalendarDays, Users, BadgeCheck } from 'lucide-react';
import { fetchOpportunity } from '../api/client';
import Photo from '../components/ui/Photo';
import Avatar from '../components/ui/Avatar';
import OrgMark from '../components/ui/OrgMark';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import { opportunityImage, avatarImage } from '../lib/media';
import { causeColor } from '../lib/causes';
import { formatDayRange, formatDuration, formatLocation, isScarce } from '../lib/format';
import { entrance } from '../lib/motion';

/*
 * Scroll-linked hero.
 *
 * The photograph starts slightly inset with a generous radius and settles
 * out to the content edges as the visitor scrolls — "I am entering this
 * opportunity", not a splash screen.
 *
 * What this deliberately does NOT do: no wheel/touchmove listeners, no
 * preventDefault, no scrollTo, no scroll locking, no "scroll to expand"
 * prompt. Native scrolling is entirely untouched; the page simply reads the
 * scroll position it already has.
 *
 * The whole effect resolves inside the first third of the hero's scroll
 * range, so it is finished while the image is still largely on screen and
 * the content below is never gated behind it.
 */
const EXPAND_RANGE = [0, 0.35];

/*
 * Isolated so the scroll hooks only ever run once the hero is actually in
 * the tree — never against a null ref during loading or error states.
 */
function HeroMedia({ opportunity, reduced }) {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Motion values drive style directly, so scrolling updates the DOM
  // without re-rendering React on every tick.
  const scale = useTransform(scrollYProgress, EXPAND_RANGE, [0.93, 1], { clamp: true });
  const borderRadius = useTransform(scrollYProgress, EXPAND_RANGE, [26, 2], { clamp: true });

  // Reduced motion gets the settled state as a plain static hero.
  const style = reduced ? undefined : { scale, borderRadius };

  return (
    <div ref={ref} className="relative">
      <motion.div
        style={style}
        className="relative origin-top overflow-hidden [will-change:transform]"
      >
        <Photo
          src={opportunityImage(opportunity)}
          alt={opportunity.title}
          ratio="16/9"
          className="lg:!aspect-[21/9]"
        />
        {/* Inside the scaling container so it stays anchored to the image
            rather than floating off its corner while the hero is inset. */}
        <Link
          to="/discover"
          aria-label="Back to Discover"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-ink backdrop-blur-sm transition-colors hover:bg-surface"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
      </motion.div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-ink-muted" strokeWidth={1.9} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
          {label}
        </p>
        <p className="mt-0.5 text-[15px] text-ink">{value}</p>
      </div>
    </div>
  );
}

function Prose({ title, body }) {
  if (!body) return null;
  return (
    <section className="border-t border-line py-6">
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-muted">{body}</p>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[16/9] w-full rounded-none lg:aspect-[21/9]" />
      <div className="mx-auto max-w-[820px] px-5 py-7 sm:px-7">
        <Skeleton className="h-7 w-3/4" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/5" />
        </div>
        <div className="mt-8">
          <SkeletonText lines={5} />
        </div>
      </div>
    </div>
  );
}

function OpportunityDetail() {
  const { id } = useParams();
  const reduced = useReducedMotion();
  const [state, setState] = useState({ status: 'loading', opportunity: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', opportunity: null });

    fetchOpportunity(id, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', opportunity: body.opportunity }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', opportunity: null });
      });

    return () => controller.abort();
  }, [id]);

  useEffect(load, [load]);

  if (state.status === 'loading') return <DetailSkeleton />;

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-[820px] px-5 py-10 sm:px-7">
        <ErrorState
          title="We couldn't load this opportunity"
          description="It may have been removed, or the connection dropped. Try again in a moment."
          onRetry={load}
        />
        <div className="mt-6">
          <Link to="/discover" className="text-[15px] font-semibold text-brand underline">
            Back to Discover
          </Link>
        </div>
      </div>
    );
  }

  const o = state.opportunity;
  const { cause, host, timing, location, participants, capacity } = o;
  const scarce = isScarce({ available: participants.available, capacity });
  const full = participants.available === 0;
  const past = new Date(timing.startsAt).getTime() < Date.now();

  return (
    <article>
      <HeroMedia opportunity={o} reduced={reduced} />

      {/* Content enters once on mount and is never gated behind the hero —
          everything below is reachable by ordinary scrolling immediately. */}
      <motion.div
        className="mx-auto max-w-[820px] px-5 py-7 sm:px-7"
        {...entrance(reduced, { y: 10, delay: 0.05 })}
      >
        <span
          className="inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
          style={{ backgroundColor: `color-mix(in srgb, ${causeColor(cause.name)} 88%, black)` }}
        >
          {cause.name}
        </span>

        <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-ink lg:text-[34px]">
          {o.title}
        </h1>

        {/* Host identity sits directly under the title: who is running this
            is part of deciding whether you trust it. */}
        <div className="mt-4 flex items-center gap-3">
          {host.type === 'organization' ? (
            <OrgMark name={host.name} causeName={cause.name} size="md" />
          ) : (
            <Avatar name={host.name} src={avatarImage(host)} size="md" />
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
              <span className="truncate">{host.name}</span>
              {host.verified && (
                <BadgeCheck
                  className="h-4 w-4 flex-shrink-0 text-cause-blue"
                  aria-label="Verified organization"
                />
              )}
            </p>
            <p className="text-[13px] text-ink-muted">
              {host.type === 'organization' ? 'Organization' : 'Community member'}
            </p>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-5 rounded-2xl border border-line bg-surface-sunken p-5 sm:grid-cols-2">
          <Fact
            icon={CalendarDays}
            label="When"
            value={formatDayRange(timing.startsAt, timing.endsAt)}
          />
          <Fact icon={Clock} label="Time commitment" value={formatDuration(timing.durationMinutes)} />
          <Fact
            icon={MapPin}
            label={location.isOnline ? 'Format' : 'Where'}
            value={formatLocation(location)}
          />
          <Fact
            icon={Users}
            label="Spots"
            value={
              full
                ? `Full · ${capacity} joined`
                : `${participants.available} of ${capacity} available`
            }
          />
        </div>

        {scarce && !full && (
          <p className="mt-3 text-[14px] font-semibold text-accent">
            Only {participants.available} spots left.
          </p>
        )}

        {/*
          Reserved space for Join. Intentionally not a button: Join is its own
          vertical slice, and a control that only changed local text would be
          a lie about what the product does.
        */}
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-5 py-4">
          <p className="text-[14px] text-ink-muted">
            {past
              ? 'This opportunity has already taken place.'
              : 'Joining opens in the next build.'}
          </p>
        </div>

        {participants.preview.length > 0 && (
          <section className="mt-8 border-t border-line pt-6">
            <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">
              Who&rsquo;s going
            </h2>
            <p className="mt-1 text-[14px] text-ink-muted">
              {participants.joined} {participants.joined === 1 ? 'person has' : 'people have'}{' '}
              signed up.
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {participants.preview.map((person) => (
                <li key={person.id} className="flex items-center gap-2">
                  <Avatar name={person.name} src={avatarImage(person)} size="sm" />
                  <span className="text-[14px] text-ink">{person.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Prose title="About this opportunity" body={o.description} />
          <Prose title="What you'll do" body={o.whatYoullDo} />
          <Prose title="What to know" body={o.requirements} />
        </div>
      </motion.div>
    </article>
  );
}

export default OpportunityDetail;
