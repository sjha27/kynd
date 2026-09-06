import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Avatar from '../components/ui/Avatar';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import FollowAction from '../components/social/FollowAction';
import ShareAction from '../components/social/ShareAction';
import ProfileMetrics from '../components/profile/ProfileMetrics';
import ImpactHistory from '../components/profile/ImpactHistory';
import { fetchUserProfile, followUser, unfollowUser } from '../api/client';
import { causeColor } from '../lib/causes';
import { avatarImage } from '../lib/media';
import { useDemoSession } from '../session/DemoSessionProvider';

/*
 * A person's contribution identity.
 *
 * The page answers one question — what does this person care about, and
 * what have they contributed to over time — and everything on it is derived
 * from real relationships: causes they chose, people who follow them,
 * activities they completed or logged.
 *
 * The layout deliberately reads as a consumer social profile rather than a
 * dashboard: on desktop the identity and its four objective facts sit in a
 * sticky left rail while the history scrolls beside them, so the history is
 * the body of the page and the numbers are context, not the headline. On
 * mobile the same pieces stack in the same order.
 *
 * The same component serves the visitor's own profile and everyone else's;
 * only Follow (hidden on your own) and empty-state copy differ.
 */
function ProfileSkeleton() {
  return (
    <PageContainer width="wide">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
        <div>
          <Skeleton className="h-24 w-24" rounded="full" />
          <Skeleton className="mt-4 h-6 w-44" />
          <Skeleton className="mt-2 h-3 w-28" />
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px]" />
            ))}
          </div>
        </div>
        <div className="mt-10 lg:mt-0">
          <SkeletonText lines={6} />
        </div>
      </div>
    </PageContainer>
  );
}

function CauseChips({ causes }) {
  if (causes.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {causes.map((cause) => (
        <li
          key={cause.id}
          className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
          style={{ backgroundColor: `color-mix(in srgb, ${causeColor(cause.name)} 88%, black)` }}
        >
          {cause.name}
        </li>
      ))}
    </ul>
  );
}

function UserProfile({ id: idProp }) {
  const params = useParams();
  const id = idProp ?? params.id;
  const { session } = useDemoSession();
  const [state, setState] = useState({ status: 'loading', profile: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', profile: null });

    fetchUserProfile(id, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', profile: body.profile }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: err.status === 404 ? 'not-found' : 'error', profile: null });
      });

    return () => controller.abort();
  }, [id]);

  useEffect(load, [load]);

  if (state.status === 'loading') return <ProfileSkeleton />;

  if (state.status === 'not-found') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't find this person"
          description="They may not exist, or this link may be out of date."
        />
      </PageContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't load this profile"
          description="Something went wrong on our end. Give it another try."
          onRetry={load}
        />
      </PageContainer>
    );
  }

  const p = state.profile;
  const isSelf = session?.user?.id === p.id;
  const location = [p.city, p.state].filter(Boolean).join(', ');

  const applyFollowResult = (res) =>
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        viewerFollowing: res.following,
        followerCount: res.followerCount,
      },
    }));

  return (
    <PageContainer width="wide">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
        {/* Identity rail. Sticky on desktop so the person stays present
            while their history scrolls; a plain block on mobile. */}
        <header className="lg:sticky lg:top-8 lg:self-start">
          <Avatar name={p.displayName} src={avatarImage(p)} size="xl" />

          <h1 className="mt-4 text-[26px] font-bold leading-tight tracking-[-0.025em] text-ink">
            {p.displayName}
          </h1>
          {location && <p className="mt-1 text-[15px] text-ink-muted">{location}</p>}

          {p.bio && (
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{p.bio}</p>
          )}

          <CauseChips causes={p.causes} />

          <div className="mt-5 flex items-center gap-5 text-[14px]">
            <span>
              <strong className="font-bold text-ink">
                {p.followerCount.toLocaleString('en-US')}
              </strong>{' '}
              <span className="text-ink-muted">Followers</span>
            </span>
            <span>
              <strong className="font-bold text-ink">
                {p.followingCount.toLocaleString('en-US')}
              </strong>{' '}
              <span className="text-ink-muted">Following</span>
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!isSelf && (
              <FollowAction
                following={p.viewerFollowing}
                onFollow={async () => applyFollowResult(await followUser(p.id))}
                onUnfollow={async () => applyFollowResult(await unfollowUser(p.id))}
              />
            )}
            <ShareAction title={`${p.displayName} on Kynd`} label="Share profile" />
          </div>

          <ProfileMetrics metrics={p.metrics} className="mt-6" />
        </header>

        <main className="mt-10 lg:mt-0">
          <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h2 className="text-[19px] font-bold tracking-[-0.015em] text-ink">Impact History</h2>
            {p.activities.length > 0 && (
              <p className="text-[13px] text-ink-muted">
                {isSelf ? 'Everything you have contributed to' : 'Contributions over time'}
              </p>
            )}
          </div>

          <ImpactHistory
            activities={p.activities}
            isSelf={isSelf}
            name={p.displayName.split(' ')[0]}
          />
        </main>
      </div>
    </PageContainer>
  );
}

export default UserProfile;
