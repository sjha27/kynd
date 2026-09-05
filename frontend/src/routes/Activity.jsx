import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, History, Bookmark } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

/*
 * Activity's three tabs come from the product plan. Tab switching is local
 * UI state only — it establishes the shell's tab language. No registrations,
 * saves, or activity data logic.
 */
const TABS = [
  {
    key: 'upcoming',
    label: 'Upcoming',
    icon: CalendarCheck,
    title: 'Nothing coming up',
    description:
      'Opportunities you join show up here, with everything you need on the day — where to be, when, and who else is going.',
    cta: 'Find something to join',
  },
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
    cta: 'Browse opportunities',
  },
];

function Activity() {
  const [active, setActive] = useState('upcoming');
  const navigate = useNavigate();
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

      <div role="tabpanel">
        <EmptyState
          icon={tab.icon}
          title={tab.title}
          description={tab.description}
          action={
            tab.cta && (
              <Button variant="secondary" onClick={() => navigate('/discover')}>
                {tab.cta}
              </Button>
            )
          }
        />
      </div>
    </PageContainer>
  );
}

export default Activity;
