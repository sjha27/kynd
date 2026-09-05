/*
 * Explains what a surface holds and offers a next step where one genuinely
 * exists. Borderless and left-aligned — a dashed box reads as a missing
 * component, which is the opposite of the intent. No guilt language, no
 * illustration set.
 */
function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-start py-10 ${className}`}>
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken">
          <Icon className="h-[21px] w-[21px] text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
      <p className="text-[20px] font-bold tracking-[-0.015em] text-ink">{title}</p>
      {description && (
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export default EmptyState;
