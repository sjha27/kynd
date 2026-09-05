import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { fetchOpportunities, fetchFundraisers } from '../api/client';
import SearchBar from '../components/discover/SearchBar';
import FilterBar from '../components/discover/FilterBar';
import FilterSheet from '../components/discover/FilterSheet';
import OpportunityCard from '../components/opportunity/OpportunityCard';
import OpportunityCardSkeleton from '../components/opportunity/OpportunityCardSkeleton';
import FundraiserCard from '../components/fundraiser/FundraiserCard';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import { CAUSES } from '../lib/causes';
import { FILTER_KEYS, activeFilterCount, labelFor } from '../lib/filters';
import { entrance, entranceInView, staggerDelay, TRANSITION } from '../lib/motion';

const PAGE_SIZE = 12;

/*
 * The curated landing sections.
 *
 * Every one is a real, explainable query against seeded relational data —
 * no personalization, because there is no visitor identity yet. "People you
 * follow are joining" is deliberately absent rather than faked.
 */
const SECTIONS = [
  {
    key: 'weekend',
    title: 'Happening this weekend',
    subtitle: 'Saturday and Sunday around Atlanta',
    params: { timing: 'weekend', sort: 'soonest' },
  },
  {
    key: 'popular',
    title: 'Popular in Atlanta',
    subtitle: 'Where the most people have signed up',
    params: { mode: 'atlanta', sort: 'popular' },
  },
  {
    key: 'atlanta',
    title: 'Around Atlanta',
    subtitle: 'In-person opportunities across the metro',
    params: { mode: 'atlanta', sort: 'soonest' },
  },
  {
    key: 'online',
    title: 'Online opportunities',
    subtitle: 'Contribute from anywhere',
    params: { mode: 'online', sort: 'soonest' },
  },
];

const SECTION_SIZE = 6;

function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const out = {};
    for (const key of FILTER_KEYS) out[key] = searchParams.get(key) || null;
    return out;
  }, [searchParams]);

  const q = searchParams.get('q') || '';
  const count = activeFilterCount(searchParams);

  // All Discover state lives in the URL, so results are shareable and the
  // browser's back button steps through filter changes naturally.
  const update = useCallback(
    (mutate) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const toggle = useCallback(
    (key, value) => {
      update((next) => {
        if (next.get(key) === value) next.delete(key);
        else next.set(key, value);
      });
    },
    [update]
  );

  const setQuery = useCallback(
    (value) => {
      update((next) => {
        if (value) next.set('q', value);
        else next.delete('q');
      });
    },
    [update]
  );

  const clear = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  return { values, q, count, toggle, setQuery, clear, searchParams };
}

function CardGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- sections */

/*
 * One card, wrapped so it can fade+rise into view. The stagger index is
 * capped in staggerDelay(), so a long grid never becomes a queue.
 */
function EnteringCard({ opportunity, index, reduced }) {
  return (
    <motion.div {...entranceInView(reduced, { y: 10, delay: staggerDelay(index, reduced) })}>
      <OpportunityCard opportunity={opportunity} />
    </motion.div>
  );
}

function Section({ section, reduced }) {
  const [state, setState] = useState({ status: 'loading', items: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', items: [] });

    fetchOpportunities({ ...section.params, limit: SECTION_SIZE }, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', items: body.opportunities }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', items: [] });
      });

    return () => controller.abort();
  }, [section]);

  // A section with nothing in it is dropped entirely rather than padded with
  // opportunities borrowed from another section.
  if (state.status === 'ready' && state.items.length === 0) return null;
  if (state.status === 'error') return null;

  return (
    <section className="mb-10">
      <motion.div className="mb-3.5" {...entranceInView(reduced, { y: 8 })}>
        <h2 className="text-[19px] font-bold tracking-[-0.015em] text-ink">{section.title}</h2>
        <p className="mt-0.5 text-[14px] text-ink-muted">{section.subtitle}</p>
      </motion.div>

      {state.status === 'loading' ? (
        <CardGrid>
          {Array.from({ length: 3 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </CardGrid>
      ) : (
        <CardGrid>
          {state.items.map((opportunity, index) => (
            <EnteringCard
              key={opportunity.id}
              opportunity={opportunity}
              index={index}
              reduced={reduced}
            />
          ))}
        </CardGrid>
      )}
    </section>
  );
}

/*
 * Fundraisers on Discover.
 *
 * Deliberately its own section against its own endpoint, rather than being
 * merged into the opportunity search/filter contract. A fundraiser is a
 * different object with different fields, and unioning the two into one
 * paginated, filtered, sorted result set would mean redesigning that
 * contract for every surface that consumes it. Browsing surfaces both;
 * searching and filtering still operate purely on opportunities.
 */
function FundraiserSection({ reduced }) {
  const [state, setState] = useState({ status: 'loading', items: [] });

  useEffect(() => {
    const controller = new AbortController();
    fetchFundraisers({ limit: 3 }, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', items: body.fundraisers }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', items: [] });
      });
    return () => controller.abort();
  }, []);

  if (state.status !== 'ready' || state.items.length === 0) return null;

  return (
    <section className="mb-10">
      <motion.div className="mb-3.5" {...entranceInView(reduced, { y: 8 })}>
        <h2 className="text-[19px] font-bold tracking-[-0.015em] text-ink">Fundraisers to support</h2>
        <p className="mt-0.5 text-[14px] text-ink-muted">Closing soonest, around Atlanta</p>
      </motion.div>

      <CardGrid>
        {state.items.map((fundraiser, index) => (
          <motion.div
            key={fundraiser.id}
            {...entranceInView(reduced, { y: 10, delay: staggerDelay(index, reduced) })}
          >
            <FundraiserCard fundraiser={fundraiser} />
          </motion.div>
        ))}
      </CardGrid>
    </section>
  );
}

function CauseRow({ active, onSelect, reduced }) {
  return (
    <motion.div className="mb-9" {...entrance(reduced, { y: 8, delay: 0.04 })}>
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        Explore by cause
      </h2>
      {/* Horizontal on mobile with snap; wraps on desktop. A browsing
          control, not the page's main content. */}
      <div className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {CAUSES.map((c) => {
          const selected = active === c.name;
          return (
            <button
              key={c.name}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(c.name)}
              className={`inline-flex h-10 flex-shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors ${
                selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              <c.icon
                className="h-4 w-4"
                style={{ color: selected ? 'white' : c.color }}
                strokeWidth={2}
                aria-hidden="true"
              />
              {c.name}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------- results */

function Results({ params, values, q, onClear, reduced }) {
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });
  const [limit, setLimit] = useState(PAGE_SIZE);

  const queryKey = params.toString();

  // Reset paging whenever the query itself changes.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading' }));

    const request = {};
    for (const [key, value] of params.entries()) request[key] = value;

    fetchOpportunities({ ...request, limit }, { signal: controller.signal })
      .then((body) =>
        setState({ status: 'ready', items: body.opportunities, total: body.page.total })
      )
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', items: [], total: 0 });
      });

    return () => controller.abort();
  }, [queryKey, limit, params]);

  const activeChips = [
    ...(q ? [{ key: 'q', label: `“${q}”` }] : []),
    ...FILTER_KEYS.filter((key) => values[key]).map((key) => ({
      key,
      label: labelFor(key, values[key]),
    })),
  ];

  if (state.status === 'error') {
    return (
      <ErrorState
        title="We couldn't load these results"
        description="The connection dropped or the service is waking up. Try again in a moment."
        onRetry={() => setLimit((v) => v)}
      />
    );
  }

  const showingSkeletons = state.status === 'loading' && state.items.length === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-[14px] text-ink-muted" aria-live="polite">
          {showingSkeletons
            ? 'Searching…'
            : `${state.total} ${state.total === 1 ? 'opportunity' : 'opportunities'}`}
        </p>
        {activeChips.map((chip) => (
          <span
            key={chip.key}
            className="rounded-full bg-surface-sunken px-2.5 py-1 text-[12px] font-medium text-ink-muted"
          >
            {chip.label}
          </span>
        ))}
      </div>

      {showingSkeletons ? (
        <CardGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </CardGrid>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matched"
          description="Try fewer filters, a different cause, or a broader search term."
          action={
            <Button variant="secondary" onClick={onClear}>
              Clear all filters
            </Button>
          }
        />
      ) : (
        <>
          {/*
            Changing a filter must not replay a page-wide entrance. The grid
            only dips in opacity while the next set is in flight — position
            is untouched, so nothing flies in on every keystroke.
          */}
          <motion.div
            animate={{ opacity: state.status === 'loading' ? 0.55 : 1 }}
            transition={TRANSITION.standard}
          >
            <CardGrid>
              {state.items.map((opportunity) => (
                <OpportunityCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </CardGrid>
          </motion.div>

          {/* Explicit "Show more" rather than infinite scroll — Kynd should
              not optimize for endless feed consumption. */}
          {state.items.length < state.total && (
            <div className="mt-7 flex justify-center">
              <Button
                variant="secondary"
                disabled={state.status === 'loading'}
                onClick={() => setLimit((v) => v + PAGE_SIZE)}
              >
                {state.status === 'loading'
                  ? 'Loading…'
                  : `Show more (${state.total - state.items.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- page */

function Discover() {
  const { values, q, count, toggle, setQuery, clear, searchParams } = useFilterState();
  const browsing = count === 0;
  const reduced = useReducedMotion();

  return (
    <div className="w-full px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
      <motion.div className="mb-1" {...entrance(reduced, { y: 8 })}>
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">
          Discover
        </h1>
        <p className="mt-1 text-[15px] text-ink-muted">
          Volunteering and charity events across Atlanta.
        </p>
      </motion.div>

      {/* The search/filter bar is the first thing a visitor with intent
          reaches for, so it enters immediately with only a token delay. */}
      <motion.div
        className="sticky top-0 z-10 -mx-5 mt-5 bg-surface/95 px-5 py-3 backdrop-blur-sm sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9"
        {...entrance(reduced, { y: 8, delay: 0.02 })}
      >
        <SearchBar value={q} onChange={setQuery} />

        <div className="mt-3 hidden lg:block">
          <FilterBar values={values} onToggle={toggle} onClear={clear} activeCount={count} />
        </div>

        <div className="mt-3 flex items-center gap-2 lg:hidden">
          <FilterSheet activeCount={count} values={values} onToggle={toggle} onClear={clear} />
          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              className="h-10 px-2 text-[14px] font-medium text-ink-muted"
            >
              Clear all
            </button>
          )}
        </div>
      </motion.div>

      <div className="mt-6">
        {browsing ? (
          <>
            <CauseRow
              active={values.cause}
              onSelect={(name) => toggle('cause', name)}
              reduced={reduced}
            />
            {SECTIONS.map((section) => (
              <Section key={section.key} section={section} reduced={reduced} />
            ))}
            <FundraiserSection reduced={reduced} />
          </>
        ) : (
          <Results
            params={searchParams}
            values={values}
            q={q}
            onClear={clear}
            reduced={reduced}
          />
        )}
      </div>
    </div>
  );
}

export default Discover;
