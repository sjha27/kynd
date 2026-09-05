import { useCallback, useEffect, useState } from 'react';
import PageContainer from '../components/layout/PageContainer';
import Skeleton from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import HomeFeedItem from '../components/home/HomeFeedItem';
import ActivityFeedItem from '../components/home/ActivityFeedItem';
import CaughtUpFooter from '../components/home/CaughtUpFooter';
import { fetchHome } from '../api/client';
import { useDemoSession } from '../session/DemoSessionProvider';

/*
 * Home is fully personalized, so unlike Discover it has nothing to show
 * until a real demo session exists. This waits on DemoSessionProvider's own
 * state rather than gating the app or re-implementing session bootstrap.
 */
function FeedSkeleton() {
  return (
    <PageContainer width="narrow">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-b border-line py-6 first:pt-0">
          <div className="mb-3 flex items-center gap-2.5">
            <Skeleton className="h-9 w-9" rounded="full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="aspect-video w-full rounded-2xl" />
        </div>
      ))}
    </PageContainer>
  );
}

function Home() {
  const { status: sessionStatus, session } = useDemoSession();
  const [state, setState] = useState({ status: 'loading', items: [] });

  const load = useCallback(() => {
    if (sessionStatus !== 'ready' || !session?.sessionId) return undefined;

    const controller = new AbortController();
    setState({ status: 'loading', items: [] });

    fetchHome({ signal: controller.signal })
      .then((body) => setState({ status: 'ready', items: body.items }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', items: [] });
      });

    return () => controller.abort();
  }, [sessionStatus, session?.sessionId]);

  useEffect(load, [load]);

  if (sessionStatus === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't load your feed"
          description="Something went wrong on our end. Give it another try."
          onRetry={() => window.location.reload()}
        />
      </PageContainer>
    );
  }

  if (sessionStatus !== 'ready' || state.status === 'loading') {
    return <FeedSkeleton />;
  }

  if (state.status === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't load your feed"
          description="Something went wrong on our end. Give it another try."
          onRetry={load}
        />
      </PageContainer>
    );
  }

  if (state.items.length === 0) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          title="It's quiet here for now"
          description="Follow people and organizations around Atlanta, and this is where you'll see what they're part of."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <h1 className="mb-2 hidden text-[26px] font-bold tracking-[-0.02em] text-ink lg:block">
        Home
      </h1>
      <ul>
        {state.items.map((item) =>
          item.family === 'personActivity' ? (
            <ActivityFeedItem key={`activity-${item.activity.id}`} item={item} />
          ) : (
            <HomeFeedItem key={`opportunity-${item.opportunity.id}`} item={item} />
          )
        )}
      </ul>
      <CaughtUpFooter />
    </PageContainer>
  );
}

export default Home;
