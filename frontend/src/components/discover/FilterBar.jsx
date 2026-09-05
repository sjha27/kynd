import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { FILTER_GROUPS, labelFor } from '../../lib/filters';

/*
 * Desktop quick filters: one compact popover per group rather than six
 * expanded forms. Each group is single-select with an off state — choosing
 * the active value again clears it.
 *
 * Light-touch popover (not Radix): it is a non-modal menu that closes on
 * outside click and Escape, which is a much smaller accessibility surface
 * than the mobile sheet's focus trap.
 */
function FilterDropdown({ group, value, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = Boolean(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors ${
          active
            ? 'border-brand bg-brand-tint font-semibold text-brand'
            : 'border-line bg-surface font-medium text-ink hover:border-line-strong'
        }`}
      >
        {active ? labelFor(group.key, value) : group.label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-20 min-w-[210px] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_8px_28px_rgba(31,27,24,0.12)]"
        >
          {group.options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onToggle(group.key, option.value);
                  setOpen(false);
                }}
                className={`block w-full rounded-xl px-3 py-2 text-left text-[14px] transition-colors ${
                  selected
                    ? 'bg-brand-tint font-semibold text-brand'
                    : 'font-medium text-ink hover:bg-surface-sunken'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBar({ values, onToggle, onClear, activeCount }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTER_GROUPS.map((group) => (
        <FilterDropdown
          key={group.key}
          group={group}
          value={values[group.key]}
          onToggle={onToggle}
        />
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-ink-muted hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear all
        </button>
      )}
    </div>
  );
}

export default FilterBar;
