import { Link } from 'react-router-dom';
import { CAUSES } from '../../lib/causes';

/*
 * Community context, not a widget stack.
 *
 * The rail is borderless: section labels over rows, sitting on the cream
 * frame. That row shape — a round mark, a strong line, a quiet line — is
 * deliberately the same shape a person, an organization, or a small photo
 * will take once real data exists, so the layout is already the right one
 * and only its contents change.
 *
 * The causes are genuinely Kynd's ten seeded categories, so this is real
 * content carrying real color. No invented recommendations, follower
 * counts, or trending filler.
 */
function RailSection({ label, children }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 px-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
        {label}
      </h2>
      {children}
    </section>
  );
}

function RightRail() {
  return (
    <aside
      aria-label="Browse by cause"
      className="sticky top-0 hidden h-screen w-[292px] flex-shrink-0 overflow-y-auto px-4 py-7 xl:block"
    >
      <RailSection label="Causes on Kynd">
        <ul className="flex flex-col">
          {CAUSES.map((c) => (
            <li key={c.name}>
              {/* These were static rows that looked tappable and did
                  nothing. They now go where a visitor would expect: Discover,
                  filtered to that cause, using the filter URL Discover
                  already reads from the address bar. */}
              <Link
                to={`/discover?cause=${encodeURIComponent(c.name)}`}
                className="flex items-center gap-3 rounded-xl px-2 py-[7px] transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `color-mix(in srgb, ${c.color} 14%, white)` }}
                >
                  <c.icon
                    className="h-[15px] w-[15px]"
                    style={{ color: c.color }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-[14px] font-medium text-ink">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </RailSection>

      <p className="px-2 text-[12px] leading-relaxed text-ink-subtle">
        Kynd is a portfolio demo. The people, organizations, and opportunities are a synthetic
        Atlanta community.
      </p>
    </aside>
  );
}

export default RightRail;
