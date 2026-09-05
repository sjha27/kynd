import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import OrgMark from '../components/ui/OrgMark';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import FollowAction from '../components/social/FollowAction';
import { fetchOrganization, followOrganization, unfollowOrganization } from '../api/client';
import { causeColor } from '../lib/causes';
import { formatWhen } from '../lib/format';

/*
 * A minimal organization page, not the full organization profile from the
 * product plan. It exists to make following an organization understandable:
 * identity, cause areas, upcoming opportunities (already computed by the
 * existing backend), and a Follow button. No admin dashboard, no impact
 * feed polish — that stays out of scope for this checkpoint.
 */
function OrgSkeleton() {
  return (
    <PageContainer width="narrow">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-[11px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="mt-8">
        <SkeletonText lines={3} />
      </div>
    </PageContainer>
  );
}

function OrganizationDetail() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', organization: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', organization: null });

    fetchOrganization(id, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', organization: body.organization }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({
          status: err.status === 404 ? 'not-found' : 'error',
          organization: null,
        });
      });

    return () => controller.abort();
  }, [id]);

  useEffect(load, [load]);

  if (state.status === 'loading') return <OrgSkeleton />;

  if (state.status === 'not-found') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't find this organization"
          description="It may not exist, or this link may be out of date."
        />
      </PageContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't load this organization"
          description="Something went wrong on our end. Give it another try."
          onRetry={load}
        />
      </PageContainer>
    );
  }

  const o = state.organization;

  return (
    <PageContainer width="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <OrgMark name={o.name} causeName={o.causes[0]?.name} size="lg" />
          <div>
            <p className="flex items-center gap-1.5 text-[20px] font-bold tracking-[-0.02em] text-ink">
              <span>{o.name}</span>
              {o.verified && (
                <BadgeCheck
                  className="h-[18px] w-[18px] flex-shrink-0 text-cause-blue"
                  aria-label="Verified organization"
                />
              )}
            </p>
            {(o.city || o.state) && (
              <p className="text-[14px] text-ink-muted">
                {[o.city, o.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        <FollowAction
          following={o.viewerFollowing}
          onFollow={async () => {
            const res = await followOrganization(o.id);
            setState((prev) => ({
              ...prev,
              organization: {
                ...prev.organization,
                viewerFollowing: res.following,
                followerCount: res.followerCount,
              },
            }));
          }}
          onUnfollow={async () => {
            const res = await unfollowOrganization(o.id);
            setState((prev) => ({
              ...prev,
              organization: {
                ...prev.organization,
                viewerFollowing: res.following,
                followerCount: res.followerCount,
              },
            }));
          }}
        />
      </div>

      {o.mission && <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">{o.mission}</p>}

      {o.causes.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {o.causes.map((cause) => (
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

      <p className="mt-5 border-y border-line py-4 text-[14px]">
        <strong className="text-ink">{o.followerCount.toLocaleString('en-US')}</strong>{' '}
        <span className="text-ink-muted">Followers</span>
      </p>

      {o.upcomingOpportunities.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">
            Upcoming opportunities
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {o.upcomingOpportunities.map((opp) => (
              <li key={opp.id} className="py-3">
                <Link
                  to={`/opportunities/${opp.id}`}
                  className="block text-[15px] font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {opp.title}
                </Link>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {formatWhen(opp.startsAt)} · {opp.participants.available} of {opp.capacity}{' '}
                  available
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}

export default OrganizationDetail;
