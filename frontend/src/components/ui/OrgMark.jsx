import { causeColor } from '../../lib/causes';

/*
 * Deterministic organization identity.
 *
 * There are 250 synthetic organizations and no logo files, so rather than
 * inventing 250 marks this derives a stable monogram: up to two initials on
 * a muted tint drawn from the cause the organization is hosting for. Same
 * organization, same mark, everywhere.
 *
 * Rounded square rather than a circle, so an organization never reads as a
 * person at a glance.
 */
const SIZES = {
  xs: 'h-6 w-6 text-[9px] rounded-[6px]',
  sm: 'h-8 w-8 text-[11px] rounded-[7px]',
  md: 'h-11 w-11 text-[14px] rounded-[9px]',
  lg: 'h-14 w-14 text-[17px] rounded-[11px]',
};

// Skips the filler words that would otherwise turn most names into "OF".
const SKIP = new Set(['of', 'the', 'and', 'for', 'a', '&']);

function monogram(name) {
  if (!name) return '?';
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  if (words.length === 0) return name.trim()[0]?.toUpperCase() ?? '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function OrgMark({ name, causeName, size = 'md', className = '' }) {
  const color = causeColor(causeName);

  return (
    <span
      role="img"
      aria-label={name || 'Organization'}
      className={`flex flex-shrink-0 items-center justify-center font-bold leading-none ${SIZES[size] ?? SIZES.md} ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, white)`,
        color,
      }}
    >
      {monogram(name)}
    </span>
  );
}

export default OrgMark;
export { monogram };
