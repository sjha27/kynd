const VARIANT_CLASSES = {
  // Deep brown carries primary actions (Join, Publish, Follow): stronger
  // hierarchy and better contrast than coral, which stays a highlight color.
  primary:
    'bg-brand text-white hover:bg-brand-hover active:bg-brand-press disabled:bg-brand/35',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-sunken active:bg-line/60 disabled:text-ink-subtle disabled:border-line',
  ghost:
    'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-line/60 disabled:text-ink-subtle',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-[13px] gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
};

function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-control font-medium transition-colors disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}

export default Button;
