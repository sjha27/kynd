import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, PartyPopper, HeartHandshake, MessageCircle } from 'lucide-react';
import Avatar from '../ui/Avatar';
import ShareAction from './ShareAction';
import { fetchEngagement, reactToContent, commentOnContent } from '../../api/client';
import { avatarImage } from '../../lib/media';
import { SensitiveInfoNotice } from '../demo/DemoNotice';

/*
 * The social layer for one piece of content, wherever it appears.
 *
 * One component for all three target types, backed by the one engagement
 * sub-resource, so no page had to grow its own engagement logic.
 *
 * The schema allows at most one reaction per person per target, so these are
 * alternatives rather than independent toggles: picking a different one
 * switches, picking the active one clears. The UI reflects that by keeping
 * at most one button lit.
 *
 * `support` is deliberately absent for fundraisers — monetary support lives
 * in fundraiser_supports, and the schema forbids the social reaction there.
 * The backend simply doesn't return it, so nothing here special-cases it.
 */
const REACTION_META = {
  like: { icon: ThumbsUp, label: 'Like', active: 'Liked' },
  celebrate: { icon: PartyPopper, label: 'Celebrate', active: 'Celebrated' },
  support: { icon: HeartHandshake, label: 'Support', active: 'Supported' },
};

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ReactionButton({ reaction, onClick, pending }) {
  const meta = REACTION_META[reaction.type];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={reaction.viewerReacted}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        reaction.viewerReacted
          ? 'bg-brand/10 text-brand'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
      }`}
    >
      <Icon
        className="h-[17px] w-[17px]"
        strokeWidth={reaction.viewerReacted ? 2.4 : 2}
        aria-hidden="true"
      />
      <span>{reaction.viewerReacted ? meta.active : meta.label}</span>
      {reaction.count > 0 && (
        <span className="tabular-nums">{reaction.count.toLocaleString('en-US')}</span>
      )}
    </button>
  );
}

function EngagementBar({ targetType, targetId, shareTitle, className = '' }) {
  const [state, setState] = useState({ status: 'loading', reactions: [], comments: [], commentCount: 0 });
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    fetchEngagement(targetType, targetId, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', ...body }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', reactions: [], comments: [], commentCount: 0 });
      });
    return () => controller.abort();
  }, [targetType, targetId]);

  useEffect(load, [load]);

  // Engagement is secondary content: if it fails, the page it sits on is
  // still entirely usable, so it disappears rather than showing an error.
  if (state.status !== 'ready') return null;

  const react = async (type) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await reactToContent(targetType, targetId, { type });
      setState((prev) => ({ ...prev, reactions: res.reactions }));
    } catch {
      setError("We couldn't save that reaction.");
    } finally {
      setPending(false);
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await commentOnContent(targetType, targetId, { body });
      setState((prev) => ({ ...prev, comments: res.comments, commentCount: res.commentCount }));
      setDraft('');
    } catch (err) {
      setError(err.message || "We couldn't post that comment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`border-t border-line pt-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-0.5">
        {state.reactions.map((reaction) => (
          <ReactionButton
            key={reaction.type}
            reaction={reaction}
            pending={pending}
            onClick={() => react(reaction.type)}
          />
        ))}

        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
          Comment
          {state.commentCount > 0 && (
            <span className="tabular-nums">{state.commentCount.toLocaleString('en-US')}</span>
          )}
        </button>

        <ShareAction title={shareTitle} />
      </div>

      {showComments && (
        <div className="mt-3">
          <form onSubmit={submitComment} className="flex items-start gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder="Add a comment"
              aria-label="Add a comment"
              className="min-h-[40px] flex-1 rounded-control border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="min-h-[40px] rounded-control px-3 text-[14px] font-semibold text-brand transition-colors disabled:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Post
            </button>
          </form>

          {/* Shown only while the composer is open, so the reminder appears
              exactly when someone is about to type something stored. */}
          <SensitiveInfoNotice className="mt-2" />

          {error && (
            <p role="alert" className="mt-2 text-[13px] text-accent">
              {error}
            </p>
          )}

          {state.comments.length > 0 ? (
            <ul className="mt-4 space-y-3.5">
              {state.comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <Avatar name={c.author.name} src={avatarImage(c.author)} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[13px]">
                      <span className="font-semibold text-ink">{c.author.name}</span>{' '}
                      <span className="text-ink-subtle">{timeAgo(c.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-ink-subtle">No comments yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default EngagementBar;
