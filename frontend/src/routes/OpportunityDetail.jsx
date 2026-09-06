import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, MapPin, Clock, CalendarDays, Users, BadgeCheck, Check } from 'lucide-react';
import { fetchOpportunity, joinOpportunity } from '../api/client';
import Photo from '../components/ui/Photo';
import Avatar from '../components/ui/Avatar';
import OrgMark from '../components/ui/OrgMark';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import SaveAction from '../components/social/SaveAction';
import LeaveAction from '../components/opportunity/LeaveAction';
import { OpportunityDemoNotice } from '../components/demo/DemoNotice';
import EngagementBar from '../components/social/EngagementBar';
import { opportunityImage, avatarImage } from '../lib/media';
import { causeColor } from '../lib/causes';
import { formatDayRange, formatDuration, formatLocation, isScarce } from '../lib/format';
import { entrance } from '../lib/motion';
import { useDemoSession } from '../session/DemoSessionProvider';
import { resolveSource, trackOpportunityViewed } from '../lib/analytics';

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

/*
 * The Join control.
 *
 * Everything it shows comes from backend state: `viewerJoined` and the
 * participant counts are re-read on every load, so Joined survives a refresh
 * and a navigate-away rather than living in React state. The optimistic-
 * looking update after a successful join just applies the numbers the server
 * returned — it never invents them.
 */
function JoinAction({ opportunity, past, onJoined, onLeft }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const joined = opportunity.viewerJoined;
  const full = opportunity.participants.available === 0;

  const join = async () => {
    if (pending) return; // guards double clicks while in flight
    setPending(true);
    setError(null);
    try {
      onJoined(await joinOpportunity(opportunity.id));
    } catch (err) {
      setError(
        err.code === 'opportunity_full'
          ? 'This opportunity just filled up.'
          : err.code === 'opportunity_not_joinable'
            ? 'This opportunity is no longer open to join.'
            : "We couldn't complete that. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  if (past) {
    return (
      <div className="w-full rounded-2xl border border-line bg-surface-sunken px-5 py-4">
        <p className="text-[14px] text-ink-muted">This opportunity has already taken place.</p>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-control bg-cause-sage px-4 py-2.5 text-sm font-semibold text-white">
          <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          Joined
        </span>
        <Link to="/activity" className="text-[14px] font-semibold text-brand underline">
          See it in Activity
        </Link>
        {/* Leaving stays deliberately quiet beside the Joined state, and
            asks before it acts. Absent once the opportunity is past, where
            the next step is completing it, not dropping out. */}
        <LeaveAction opportunity={opportunity} onLeft={onLeft} />
      </div>
    );
  }

  return (
    <div>
      <Button onClick={join} disabled={pending || full} className="min-w-[140px]">
        {pending ? 'Joining…' : full ? 'Full' : 'Join'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-[14px] text-accent">
          {error}
        </p>
      )}
    </div>
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

/*
 * Attendees are already scoped to seeded users plus the viewer's own
 * temporary user (see backend/src/db/visibility.js), so the only temporary
 * identity that can ever appear here is the current visitor. Comparing ids
 * — rather than the display name "Kynd Visitor" — is what makes this
 * correct even if that name ever changes.
 */
function AttendeeItem({ person, currentUserId }) {
  const content = (
    <>
      <Avatar name={person.name} src={avatarImage(person)} size="sm" />
      <span className="text-[14px] text-ink">{person.name}</span>
    </>
  );

  if (person.id === currentUserId) {
    return <div className="flex items-center gap-2">{content}</div>;
  }

  return (
    <Link
      to={`/users/${person.id}`}
      className="flex items-center gap-2 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
    >
      {content}
    </Link>
  );
}

function OpportunityDetail() {
  const { id } = useParams();
  // Named to avoid colliding with the opportunity's own `location`.
  const routerLocation = useLocation();
  const { session } = useDemoSession();
  const reduced = useReducedMotion();
  const [state, setState] = useState({ status: 'loading', opportunity: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', opportunity: null });

    fetchOpportunity(id, { signal: controller.signal })
      .then((body) => {
        setState({ status: 'ready', opportunity: body.opportunity });
        // Reported from here rather than the server so the surface the
        // visitor came from travels with the view.
        trackOpportunityViewed(body.opportunity, resolveSource(routerLocation.state));
      })
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
            is part of deciding whether you trust it. Linked to the host's
            page so trust and Follow live in the same place. */}
        <Link
          to={host.type === 'organization' ? `/organizations/${host.id}` : `/users/${host.id}`}
          className="mt-4 flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {host.type === 'organization' ? (
            <OrgMark name={host.name} causeName={cause.name} size="md" />
          ) : (
            <Avatar name={host.name} src={avatarImage(host)} size="md" />
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink hover:underline">
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
        </Link>

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

        {/* Above the Join control, because that is the moment a visitor
            could otherwise believe this is a real event they can attend. */}
        <OpportunityDemoNotice className="mt-6" />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <JoinAction
            opportunity={o}
            past={past}
            onJoined={(result) =>
              setState((prev) => ({
                ...prev,
                opportunity: {
                  ...prev.opportunity,
                  viewerJoined: true,
                  participants: {
                    ...prev.opportunity.participants,
                    joined: result.participantCount,
                    available: result.availableSpots,
                  },
                },
              }))
            }
            onLeft={(result) =>
              setState((prev) => ({
                ...prev,
                opportunity: {
                  ...prev.opportunity,
                  viewerJoined: false,
                  participants: {
                    ...prev.opportunity.participants,
                    joined: result.participantCount,
                    available: result.availableSpots,
                    // The viewer is no longer among those going, so drop
                    // them from the preview rather than waiting for a
                    // refetch to correct it.
                    preview: prev.opportunity.participants.preview.filter(
                      (p) => p.id !== session?.user?.id
                    ),
                  },
                },
              }))
            }
          />
          <SaveAction opportunity={o} variant="button" />
        </div>

        <EngagementBar
          targetType="opportunities"
          targetId={o.id}
          shareTitle={o.title}
          className="mt-7"
        />

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
                <li key={person.id}>
                  <AttendeeItem person={person} currentUserId={session?.user?.id} />
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
