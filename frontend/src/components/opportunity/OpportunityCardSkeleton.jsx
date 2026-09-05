import Skeleton from '../ui/Skeleton';

// Mirrors OpportunityCard's proportions so a cold Render start reflows as
// little as possible when the real cards arrive.
function OpportunityCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading opportunity"
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6" rounded="full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export default OpportunityCardSkeleton;
