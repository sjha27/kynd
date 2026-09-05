import { RotateCw } from 'lucide-react';
import Button from './Button';

/*
 * Calm, human, product-facing. Callers must not pass raw backend messages,
 * status codes, or stack traces into this — the point is that a cold start
 * or a dropped request reads as "try again", not as a crash.
 */
function ErrorState({
  title = "This didn't load",
  description = 'Something went wrong on our end. Give it another try.',
  onRetry,
  className = '',
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-12 text-center ${className}`}
    >
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
