import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

/*
 * Share, kept deliberately small.
 *
 * The native share sheet where the browser offers one, a clipboard copy
 * otherwise. Nothing is tracked and nothing is posted — sharing a Kynd link
 * is just handing someone a URL, and there is no backend concept of a share.
 */
function ShareAction({ title, label = 'Share' }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // A dismissed share sheet is a normal outcome, not an error, and
        // must not fall through to a surprise clipboard write.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied permission). Staying
      // silent is better than an error for a purely optional affordance.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      {copied ? (
        <Check className="h-[17px] w-[17px] text-brand" strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <Share2 className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
      )}
      {copied ? 'Link copied' : label}
    </button>
  );
}

export default ShareAction;
