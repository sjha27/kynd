import { Link } from 'react-router-dom';

/*
 * Inline demo disclosures.
 *
 * Someone can arrive on an opportunity or a fundraiser through a deep link
 * and never see the About page, so the two things a visitor could genuinely
 * misunderstand — that a listing is a real event, and that Support moves
 * money — are stated on the surfaces themselves.
 *
 * Product copy, not a legal banner: one quiet line, readable on mobile,
 * placed where the misunderstanding would happen rather than at the bottom
 * of the page.
 */
function DemoNotice({ children, tone = 'neutral', className = '' }) {
  const toneClasses =
    tone === 'strong'
      ? 'border-accent/35 bg-accent/[0.06] text-ink'
      : 'border-line bg-surface-sunken text-ink-muted';

  return (
    <p
      className={`rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${toneClasses} ${className}`}
    >
      {children}
    </p>
  );
}

export function OpportunityDemoNotice({ className = '' }) {
  return (
    <DemoNotice className={className}>
      <strong className="font-semibold text-ink">Demo listing.</strong> This is a synthetic
      opportunity in the Kynd portfolio demo — it isn&rsquo;t a real event, and no one is expecting
      you.{' '}
      <Link to="/demo-info" className="font-semibold text-brand underline underline-offset-2">
        About this demo
      </Link>
    </DemoNotice>
  );
}

export function FundraiserDemoNotice({ className = '' }) {
  return (
    <DemoNotice tone="strong" className={className}>
      <strong className="font-semibold text-ink">Demo only &mdash; no payment is taken.</strong>{' '}
      Supporting this fundraiser is simulated. No card is collected, no money moves, and no donation
      is made.
    </DemoNotice>
  );
}

/*
 * One shared line for surfaces where a visitor types free text that gets
 * stored. Small and factual — a reminder, not a warning label, and not
 * repeated per field.
 */
export function SensitiveInfoNotice({ className = '' }) {
  return (
    <p className={`text-[13px] leading-relaxed text-ink-subtle ${className}`}>
      This is a public demo &mdash; please don&rsquo;t include sensitive personal information.
    </p>
  );
}

export default DemoNotice;
