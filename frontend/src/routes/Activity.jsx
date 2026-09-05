import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, History, Bookmark } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import OpportunityCard from '../components/opportunity/OpportunityCard';
import OpportunityCardSkeleton from '../components/opportunity/OpportunityCardSkeleton';
import { fetchActivity } from '../api/client';

/*
 * Activity's three tabs come from the product plan. Only Upcoming is backed
 * by real data in this slice; Completed and Saved stay honest placeholders
 * until their own slices rather than pretending to be empty results.
 */
const TABS = [
  { key: 'upcoming', label: 'Upcoming', icon: CalendarCheck },
  {
    key: 'completed',
    label: 'Completed',
    icon: History,
    title: 'No history yet',
    description:
      'Once you take part in something, it becomes part of your history — the hours, the photos, and the story if you want to tell one.',
  },
  {
    key: 'saved',
    label: 'Saved',
    icon: Bookmark,
    title: 'Nothing saved',
    description: 'Keep track of what you are considering and come back when you are ready.',
  },
];

/*
 * The visitor's own upcoming joined opportunities.
 *
 * Everything here comes from the session's real registrations — nothing is
 * hard-coded, so this is empty until the visitor actually joins something.
 */
function Upcoming() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', items: [] });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading' }));

    fetchActivity({ signal: controller.signal })
      .then((body) => setState({ status: 'ready', items: body.upcoming }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // A 401 means the session vanished; the provider will re-bootstrap on
        // the next load, so this reads as "nothing yet" rather than an error.
        if (err.status === 401) {
          setState({ status: 'ready', items: [] });
          return;
        }
        setState({ status: 'error', items: [] });
      });

    return () => controller.abort();
  }, []);

  useEffect(load, [load]);

  if (state.status === 'loading' && state.items.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="We couldn't load your upcoming plans"
        description="The connection dropped or the service is waking up. Try again in a moment."
        onRetry={load}
      />
    );
  }

  if (state.items.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing upcoming yet"
        description="Opportunities you join show up here, with everything you need on the day."
        action={
          <Button variant="secondary" onClick={() => navigate('/discover')}>
            Find something to join
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {state.items.map((opportunity) => (
        <OpportunityCard key={opportunity.id} opportunity={opportunity} />
      ))}
    </div>
  );
}

function Activity() {
  const [active, setActive] = useState('upcoming');
  const tab = TABS.find((t) => t.key === active);

  return (
    <PageContainer width="narrow">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">Activity</h1>

      <div role="tablist" aria-label="Activity views" className="mt-6 flex gap-6 border-b border-line">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`-mb-px min-h-[44px] border-b-2 pb-3 text-[15px] transition-colors ${
                isActive
                  ? 'border-brand font-bold text-ink'
                  : 'border-transparent font-medium text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-7">
        {active === 'upcoming' ? (
          <Upcoming />
        ) : (
          <EmptyState icon={tab.icon} title={tab.title} description={tab.description} />
        )}
      </div>
    </PageContainer>
  );
}

export default Activity;
