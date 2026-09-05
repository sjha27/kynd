import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/*
 * Photography is meant to carry much of Kynd's visual energy, so images get
 * deliberate treatment rather than a raw <img>:
 *
 *  - a neutral placeholder holds the aspect ratio while loading (no reflow)
 *  - a failed or missing image degrades to a calm neutral panel, never a
 *    broken-image glyph
 *  - no brand-color filter is applied; real community photography should
 *    look like itself
 */
const RATIO_CLASSES = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  square: 'aspect-square',
};

function Photo({ src, alt, ratio = '16/9', className = '', children }) {
  const [state, setState] = useState(src ? 'loading' : 'empty');
  const ratioClass = RATIO_CLASSES[ratio] ?? RATIO_CLASSES['16/9'];

  return (
    <div
      className={`relative w-full overflow-hidden bg-surface-sunken ${ratioClass} ${className}`}
    >
      {src && state !== 'error' && (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* 'empty' (no src was ever given) stays a plain neutral panel —
          only a genuine load failure earns the broken-image affordance. */}
      {state !== 'loaded' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === 'loading' && (
            <span className="h-full w-full animate-fade-soft bg-line/50" aria-hidden="true" />
          )}
          {state === 'error' && (
            <ImageOff className="h-5 w-5 text-ink-subtle" aria-hidden="true" />
          )}
        </div>
      )}

      {children}
    </div>
  );
}

export default Photo;
