import { useState } from 'react';
import Button from '../ui/Button';

/*
 * The Follow control, shared by user and organization profiles.
 *
 * Everything it shows comes from the backend: `following` and `followerCount`
 * are re-read on every load, and a successful toggle applies the numbers the
 * server returned rather than the browser guessing the new count — same rule
 * Join's JoinAction follows for participant counts.
 */
function FollowAction({ following, onFollow, onUnfollow, className = '' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const toggle = async () => {
    if (pending) return; // guards double clicks while in flight
    setPending(true);
    setError(null);
    try {
      if (following) {
        await onUnfollow();
      } else {
        await onFollow();
      }
    } catch {
      setError("We couldn't complete that. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <Button
        onClick={toggle}
        disabled={pending}
        variant={following ? 'secondary' : 'primary'}
        className="min-w-[110px]"
      >
        {pending
          ? following
            ? 'Unfollowing…'
            : 'Following…'
          : following
            ? 'Following'
            : 'Follow'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-[14px] text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

export default FollowAction;
