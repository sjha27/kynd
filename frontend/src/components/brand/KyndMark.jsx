/*
 * Two expressions of one identity:
 *
 *   wordmark — "Kynd" set in brown, no container. This is the in-product
 *              identity. The previous brown rounded-rect around the word
 *              made the logo read as a button in the nav; consumer apps
 *              put a bare confident wordmark there instead.
 *
 *   icon     — the brown rounded square, kept for genuinely app-icon
 *              contexts (favicon, install tile) where a container is the
 *              point rather than stray chrome.
 *
 * Rendered as live text, not SVG paths, so it stays hinted and crisp at
 * small sizes. Custom drawn letterforms remain a later branding task.
 */

const WORDMARK_SIZES = {
  sm: 'text-[19px]',
  md: 'text-[23px]',
  lg: 'text-[28px]',
};

const ICON_SIZES = { sm: 28, md: 34, lg: 44 };

function KyndMark({ variant = 'wordmark', size = 'md', className = '' }) {
  if (variant === 'icon') {
    const px = ICON_SIZES[size] ?? ICON_SIZES.md;
    return (
      <span
        role="img"
        aria-label="Kynd"
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-[26%] bg-brand font-bold leading-none text-white ${className}`}
        style={{ width: px, height: px, fontSize: px * 0.5, letterSpacing: '-0.03em' }}
      >
        K
      </span>
    );
  }

  return (
    <span
      className={`font-bold leading-none text-brand ${WORDMARK_SIZES[size] ?? WORDMARK_SIZES.md} ${className}`}
      style={{ letterSpacing: '-0.035em' }}
    >
      Kynd
    </span>
  );
}

export default KyndMark;
