import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Avatar from '../components/ui/Avatar';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import FollowAction from '../components/social/FollowAction';
import { fetchUserProfile, followUser, unfollowUser } from '../api/client';
import { causeColor } from '../lib/causes';
import { avatarImage } from '../lib/media';
import { useDemoSession } from '../session/DemoSessionProvider';

/*
 * A bare public identity card, not the full Profile from the product plan.
 * It exists to make Follow/Following understandable: who this is, what they
 * care about, the objective metrics the backend already computes, and
 * whether the viewer follows them. Impact History, Stories, and an activity
 * timeline stay out of scope until the Profile slice.
 */
const METRICS = [
  { key: 'hours', label: 'Hours' },
  { key: 'activities', label: 'Activities' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'amountRaisedCents', label: 'Raised' },
];

function formatMetricValue(key, value) {
  if (key === 'amountRaisedCents') {
    return `$${(value / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString('en-US');
}

function ProfileSkeleton() {
  return (
    <PageContainer width="narrow">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20" rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-8">
        <SkeletonText lines={3} />
      </div>
    </PageContainer>
  );
}

function UserProfile() {
  const { id } = useParams();
  const { session } = useDemoSession();
  const [state, setState] = useState({ status: 'loading', profile: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', profile: null });

    fetchUserProfile(id, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', profile: body.profile }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({
          status: err.status === 404 ? 'not-found' : 'error',
          profile: null,
        });
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

  return (
    <PageContainer width="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={p.displayName} src={avatarImage(p)} size="lg" />
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
              {p.displayName}
            </h1>
            {(p.city || p.state) && (
              <p className="text-[14px] text-ink-muted">
                {[p.city, p.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        {!isSelf && (
          <FollowAction
            following={p.viewerFollowing}
            onFollow={async () => {
              const res = await followUser(p.id);
              setState((prev) => ({
                ...prev,
                profile: { ...prev.profile, viewerFollowing: res.following, followerCount: res.followerCount },
              }));
            }}
            onUnfollow={async () => {
              const res = await unfollowUser(p.id);
              setState((prev) => ({
                ...prev,
                profile: { ...prev.profile, viewerFollowing: res.following, followerCount: res.followerCount },
              }));
            }}
          />
        )}
      </div>

      {p.bio && <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">{p.bio}</p>}

      {p.causes.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {p.causes.map((cause) => (
            <li
              key={cause.id}
              className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
              style={{ backgroundColor: `color-mix(in srgb, ${causeColor(cause.name)} 88%, black)` }}
            >
              {cause.name}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-center gap-5 border-y border-line py-4 text-[14px]">
        <span>
          <strong className="text-ink">{p.followerCount.toLocaleString('en-US')}</strong>{' '}
          <span className="text-ink-muted">Followers</span>
        </span>
        <span>
          <strong className="text-ink">{p.followingCount.toLocaleString('en-US')}</strong>{' '}
          <span className="text-ink-muted">Following</span>
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="rounded-2xl border border-line bg-surface-sunken px-4 py-4">
            <p className="text-[20px] font-bold tracking-[-0.02em] text-ink">
              {formatMetricValue(key, p.metrics[key])}
            </p>
            <p className="mt-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
              {label}
            </p>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

export default UserProfile;
