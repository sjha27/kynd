/*
 * Render's free tier can cold-start, so loading needs to look composed
 * rather than broken. A slow opacity fade, not a shimmer sweep — and the
 * global reduced-motion rule flattens it entirely for users who ask.
 */
function Skeleton({ className = '', rounded = 'control' }) {
  const roundedClass = rounded === 'full' ? 'rounded-full' : 'rounded-control';
  return (
    <span
      aria-hidden="true"
      className={`block animate-fade-soft bg-line/70 ${roundedClass} ${className}`}
    />
  );
}

function SkeletonText({ lines = 3, className = '' }) {
  return (
    <span className={`block space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </span>
  );
}

// Card-shaped placeholder matching the media-led layout later API-driven
// content will use. Announced once as a whole, not per-shape.
function SkeletonCard({ className = '' }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" rounded="full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

export default Skeleton;
export { SkeletonText, SkeletonCard };
