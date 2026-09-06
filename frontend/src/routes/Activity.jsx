import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarCheck, History, Bookmark } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import OpportunityCard from '../components/opportunity/OpportunityCard';
import OpportunityCardSkeleton from '../components/opportunity/OpportunityCardSkeleton';
import CompleteAction from '../components/activity/CompleteAction';
import LeaveAction from '../components/opportunity/LeaveAction';
import CompletedActivityCard from '../components/activity/CompletedActivityCard';
import { fetchActivity } from '../api/client';

// All three tabs are real now.
const SAVED_TAB = { key: 'saved', label: 'Saved', icon: Bookmark };

/*
 * Shared load: both Upcoming and Completed come from the same endpoint, and
 * completing an opportunity moves it from one list to the other, so a
 * successful completion refetches both rather than mutating local state.
 */
const EMPTY_ACTIVITY = { upcoming: [], completed: [], awaitingConfirmation: [], saved: [] };

function useActivity() {
  const [state, setState] = useState({ status: 'loading', ...EMPTY_ACTIVITY });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading' }));

    fetchActivity({ signal: controller.signal })
      .then((body) =>
        setState({
          status: 'ready',
          upcoming: body.upcoming,
          completed: body.completed,
          awaitingConfirmation: body.awaitingConfirmation,
          saved: body.saved,
        })
      )
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // A 401 means the session vanished; the provider will re-bootstrap on
        // the next load, so this reads as "nothing yet" rather than an error.
        if (err.status === 401) {
          setState({ status: 'ready', ...EMPTY_ACTIVITY });
          return;
        }
        setState({ status: 'error', ...EMPTY_ACTIVITY });
      });

    return () => controller.abort();
  }, []);

  useEffect(load, [load]);

  // setState is exposed so Saved can drop a card the visitor just unsaved
  // without a full refetch of every tab.
  return { state, setState, reload: load };
}

function Upcoming({ items, awaitingConfirmation, status, onReload }) {
  const navigate = useNavigate();

  if (status === 'loading' && items.length === 0 && awaitingConfirmation.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="We couldn't load your upcoming plans"
        description="The connection dropped or the service is waking up. Try again in a moment."
        onRetry={onReload}
      />
    );
  }

  if (items.length === 0 && awaitingConfirmation.length === 0) {
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
    <div>
      {/* The normal "Did you participate?" state: a joined opportunity
          whose real end has already passed, with no activity yet. Kept
          inside the existing Upcoming view rather than a new tab. */}
      {awaitingConfirmation.length > 0 && (
        <section className="mb-7">
          <h2 className="text-[15px] font-bold text-ink">Did you participate?</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {awaitingConfirmation.map((opportunity) => (
              <div key={opportunity.id}>
                <OpportunityCard opportunity={opportunity} />
                {/* No Leave here: this one already happened, so the honest
                    next step is recording it, not dropping out of it. */}
                <div className="mt-2">
                  <CompleteAction opportunity={opportunity} onCompleted={onReload} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((opportunity) => (
            <div key={opportunity.id}>
              <OpportunityCard opportunity={opportunity} source="activity_upcoming" />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <CompleteAction opportunity={opportunity} onCompleted={onReload} />
                {/* Upcoming already has an action area, so Leave belongs
                    here too — this is where someone realises they can't
                    make it. A full reload keeps every tab honest. */}
                <LeaveAction opportunity={opportunity} onLeft={onReload} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Completed({ items, status, onReload }) {
  const navigate = useNavigate();

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="We couldn't load your history"
        description="The connection dropped or the service is waking up. Try again in a moment."
        onRetry={onReload}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No history yet"
        description="Once you take part in something, it becomes part of your history — the hours, the photos, and the story if you want to tell one."
        action={
          <Button variant="secondary" onClick={() => navigate('/create/log')}>
            Log something you did
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((activity) => (
        <CompletedActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

/*
 * Saved is a bookmark list the visitor curates, so unsaving removes the card
 * immediately rather than waiting for a refetch — the item is gone because
 * they just removed it, and leaving it sitting there would read as a bug.
 */
function Saved({ items, status, onReload, onUnsaved }) {
  const navigate = useNavigate();

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="We couldn't load your saved list"
        description="The connection dropped or the service is waking up. Try again in a moment."
        onRetry={onReload}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Nothing saved"
        description="Keep track of what you are considering and come back when you are ready."
        action={
          <Button variant="secondary" onClick={() => navigate('/discover')}>
            Browse opportunities
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((opportunity) => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          source="activity_saved"
          onSaveChange={(saved) => {
            if (!saved) onUnsaved(opportunity.id);
          }}
        />
      ))}
    </div>
  );
}

function Activity() {
  // Logging an activity lands here on Completed, where the new entry is —
  // rather than on Upcoming, which has nothing to do with what just happened.
  const location = useLocation();
  const [active, setActive] = useState(location.state?.tab ?? 'upcoming');
  const { state, setState, reload } = useActivity();

  const TABS = [
    { key: 'upcoming', label: 'Upcoming', icon: CalendarCheck },
    { key: 'completed', label: 'Completed', icon: History },
    SAVED_TAB,
  ];

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
        {active === 'upcoming' && (
          <Upcoming
            items={state.upcoming}
            awaitingConfirmation={state.awaitingConfirmation}
            status={state.status}
            onReload={reload}
          />
        )}
        {active === 'completed' && (
          <Completed items={state.completed} status={state.status} onReload={reload} />
        )}
        {active === 'saved' && (
          <Saved
            items={state.saved}
            status={state.status}
            onReload={reload}
            onUnsaved={(id) =>
              setState((prev) => ({ ...prev, saved: prev.saved.filter((o) => o.id !== id) }))
            }
          />
        )}
      </div>
    </PageContainer>
  );
}

export default Activity;
