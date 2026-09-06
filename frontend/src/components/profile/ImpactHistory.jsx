import ImpactHistoryCard from './ImpactHistoryCard';
import EmptyState from '../ui/EmptyState';
import { History } from 'lucide-react';

/*
 * Contribution history, grouped by year.
 *
 * The year rails are the point of this surface: they make accumulation
 * legible, which is the whole thesis — a profile gets richer because a
 * person kept showing up, not because the product awarded them anything.
 * A veteran contributor's page is simply longer than a new one's.
 */
function groupByYear(activities) {
  const groups = [];
  for (const activity of activities) {
    // occurredOn is a plain 'YYYY-MM-DD' calendar date, so the year is the
    // first four characters — no Date parsing, and no timezone to shift it.
    const year = String(activity.occurredOn).slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(activity);
    else groups.push({ year, items: [activity] });
  }
  return groups;
}

function ImpactHistory({ activities, isSelf, name }) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={isSelf ? 'Your history starts here' : 'No history yet'}
        description={
          isSelf
            ? 'Take part in something, or log something you did elsewhere, and it becomes part of your history — the hours, the photos, and the story if you want to tell one.'
            : `${name} hasn't added any contributions yet.`
        }
      />
    );
  }

  const groups = groupByYear(activities);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.year}>
          <div className="mb-3.5 flex items-center gap-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              {group.year}
            </h3>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
            <span className="text-[13px] text-ink-subtle">
              {group.items.length} {group.items.length === 1 ? 'contribution' : 'contributions'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {group.items.map((activity) => (
              <ImpactHistoryCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default ImpactHistory;
