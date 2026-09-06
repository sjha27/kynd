import PageContainer from '../layout/PageContainer';

/*
 * Shared layout for the three transparency pages.
 *
 * These are product pages, not a legal wall: readable measure, real
 * headings, plain English. They deliberately look like part of Kynd rather
 * than like a pasted contract.
 */
export function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-[18px] font-bold tracking-[-0.015em] text-ink">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item) => (
        <li key={typeof item === 'string' ? item : item.key}>
          {typeof item === 'string' ? item : item.node}
        </li>
      ))}
    </ul>
  );
}

function DocPage({ title, intro, updated, children }) {
  return (
    <PageContainer width="narrow">
      <h1 className="text-[28px] font-bold tracking-[-0.025em] text-ink lg:text-[32px]">{title}</h1>
      {intro && <p className="mt-2.5 text-[16px] leading-relaxed text-ink-muted">{intro}</p>}
      {updated && (
        <p className="mt-3 text-[13px] text-ink-subtle">Last updated {updated}</p>
      )}
      <div className="mt-2">{children}</div>
    </PageContainer>
  );
}

export default DocPage;
