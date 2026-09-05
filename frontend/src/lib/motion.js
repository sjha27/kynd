/*
 * Kynd's motion vocabulary.
 *
 * One place for durations, easings and springs so surfaces stay consistent
 * and nobody has to invent a number at the call site. Deliberately small:
 * Kynd uses motion to clarify hierarchy and interaction, not to perform.
 *
 * Division of labour, kept intentionally:
 *   CSS/Tailwind — colour, border, simple hover/focus states
 *   Framer Motion — coordinated transforms, springs, presence, scroll
 *
 * Reduced motion is handled at the call site with `useReducedMotion()`,
 * because each surface has a different sensible "still" version. The
 * helpers below take a `reduced` flag and return the right variant rather
 * than every component re-deriving that logic.
 */

// Standard easing — a gentle ease-out. No overshoot: Kynd should feel
// refined and responsive, never springy or toy-like.
export const EASE = [0.22, 0.61, 0.36, 1];

export const DURATION = {
  // Button response, icon shifts, press feedback.
  fast: 0.15,
  // Card hover, filter UI, small content swaps.
  standard: 0.25,
  // Section and detail content reveals.
  entrance: 0.42,
};

/*
 * Restrained springs. Damping is high relative to stiffness so movement
 * settles rather than bouncing — the sheet should feel physical, not
 * playful.
 */
export const SPRING = {
  // Bottom sheet enter.
  sheet: { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 },
  // Card lift on hover.
  lift: { type: 'spring', stiffness: 400, damping: 32 },
};

export const TRANSITION = {
  fast: { duration: DURATION.fast, ease: EASE },
  standard: { duration: DURATION.standard, ease: EASE },
  entrance: { duration: DURATION.entrance, ease: EASE },
};

/*
 * Content entrance: fade with a small rise.
 *
 * `once: true` on the viewport is applied by callers so a section does not
 * replay every time it scrolls back into view — replaying would be noise,
 * and would make scrolling back up feel unstable.
 */
export function entrance(reduced, { y = 12, delay = 0 } = {}) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: DURATION.fast, delay: 0 },
    };
  }
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { ...TRANSITION.entrance, delay },
  };
}

// Same shape, driven by scroll position instead of mount.
export function entranceInView(reduced, { y = 12, delay = 0 } = {}) {
  const spec = entrance(reduced, { y, delay });
  return {
    initial: spec.initial,
    whileInView: spec.animate,
    viewport: { once: true, amount: 0.15 },
    transition: spec.transition,
  };
}

/*
 * Stagger for a row of cards. Capped so a long grid never turns into a
 * queue the visitor has to wait out — after the cap, cards simply arrive
 * together.
 */
export const STAGGER_STEP = 0.05;
export const STAGGER_MAX_INDEX = 5;

export function staggerDelay(index, reduced) {
  if (reduced) return 0;
  return Math.min(index, STAGGER_MAX_INDEX) * STAGGER_STEP;
}

/*
 * Opportunity card. The card moves as ONE object: the parent's hover state
 * drives the child image variant, so nothing inside animates independently.
 */
export function cardVariants(reduced) {
  if (reduced) {
    // No transform motion at all — hover/focus still reads through the
    // border and shadow colour changes handled in CSS.
    return {
      card: { rest: {}, hover: {}, press: {} },
      image: { rest: {}, hover: {}, press: {} },
    };
  }
  return {
    card: {
      rest: { y: 0, scale: 1 },
      hover: { y: -3 },
      press: { scale: 0.99 },
    },
    image: {
      rest: { scale: 1 },
      hover: { scale: 1.025 },
      press: { scale: 1.01 },
    },
  };
}
