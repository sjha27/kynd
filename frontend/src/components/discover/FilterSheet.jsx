import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, SlidersHorizontal } from 'lucide-react';
import Button from '../ui/Button';
import { FILTER_GROUPS } from '../../lib/filters';
import { SPRING, TRANSITION } from '../../lib/motion';

/*
 * Mobile filter sheet.
 *
 * Radix Dialog still owns every accessibility concern — focus trapping,
 * focus restoration to the trigger, Escape, aria-modal wiring, and body
 * scroll lock. Framer Motion is layered onto presentation only.
 *
 * The mechanism: Radix's Portal/Overlay/Content are `forceMount`ed and the
 * open state is lifted into React, so AnimatePresence controls when the
 * nodes actually leave the tree. Without this, Radix would unmount
 * instantly and the exit animation would never be seen. Radix's own
 * behaviour is unchanged — it is still the component deciding what is
 * focusable and what Escape does.
 *
 * Opening the sheet is the signature interaction; the controls inside stay
 * put rather than each animating in.
 */
function FilterSheet({ activeCount, values, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  // Reduced motion keeps a short cross-fade so the sheet's arrival is still
  // perceivable, but drops the travel entirely.
  const sheetMotion = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: TRANSITION.fast,
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: SPRING.sheet,
      };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] font-medium text-ink active:bg-surface-sunken"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={TRANSITION.standard}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-3xl bg-surface"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                {...sheetMotion}
              >
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <Dialog.Title className="text-[17px] font-bold text-ink">Filters</Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close filters"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted active:bg-surface-sunken"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Narrow opportunities by when, where, type, host, time commitment, and cause.
                </Dialog.Description>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {FILTER_GROUPS.map((group) => (
                    <fieldset key={group.key} className="mb-6 border-0 p-0">
                      <legend className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
                        {group.label}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map((option) => {
                          const selected = values[group.key] === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => onToggle(group.key, option.value)}
                              className={`min-h-[40px] rounded-full border px-4 text-[14px] transition-colors ${
                                selected
                                  ? 'border-brand bg-brand font-semibold text-white'
                                  : 'border-line bg-surface font-medium text-ink'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>

                <div className="flex gap-3 border-t border-line px-5 py-4">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={onClear}
                    disabled={activeCount === 0}
                  >
                    Clear all
                  </Button>
                  <Dialog.Close asChild>
                    <Button className="flex-1">Show results</Button>
                  </Dialog.Close>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export default FilterSheet;
