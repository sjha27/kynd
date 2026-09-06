/*
 * The one form field style in Kynd.
 *
 * This markup was duplicated verbatim across Log activity, Create an
 * opportunity and Start a fundraiser, which meant three places to keep in
 * sync every time a control changed. One definition means the three creation
 * flows are guaranteed to look like the same product.
 *
 * The label wraps its control, so every input is associated with its label
 * without needing matching id/htmlFor pairs that can silently drift apart.
 */
export const FIELD_CLASSES =
  'mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-ink-muted">{hint}</span>}
    </label>
  );
}

export default Field;
