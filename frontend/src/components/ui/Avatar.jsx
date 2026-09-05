import { useState } from 'react';

/*
 * Deterministic fallback: the same name always produces the same tint, so
 * avatars never flicker between colors on re-render and a missing image
 * still looks intentional rather than broken.
 *
 * People render as circles, organizations as rounded squares — the shape
 * itself distinguishes the two entity types without relying on color.
 */
const FALLBACK_TINTS = [
  'var(--color-cause-blue)',
  'var(--color-cause-sage)',
  'var(--color-cause-terracotta)',
  'var(--color-cause-violet)',
  'var(--color-cause-teal)',
  'var(--color-cause-amber)',
];

function tintForName(name) {
  const source = name || '?';
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}

function initialsForName(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const SIZE_CLASSES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-20 w-20 text-xl',
};

function Avatar({ src, name, shape = 'circle', size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const shapeClass = shape === 'square' ? 'rounded-[10px]' : 'rounded-full';
  const label = name ? `${name}` : 'Avatar';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${sizeClass} ${shapeClass} flex-shrink-0 border border-line object-cover ${className}`}
      />
    );
  }

  const initials = initialsForName(name);

  return (
    <span
      role="img"
      aria-label={label}
      className={`flex flex-shrink-0 items-center justify-center font-semibold text-white ${sizeClass} ${shapeClass} ${className}`}
      style={{ backgroundColor: initials ? tintForName(name) : 'var(--color-line-strong)' }}
    >
      {initials}
    </span>
  );
}

export default Avatar;
