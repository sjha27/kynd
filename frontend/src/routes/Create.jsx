import { Link } from 'react-router-dom';
import { CalendarPlus, ChevronRight, HandCoins, NotebookPen } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';

/*
 * Kynd's three creation paths — this is the real product surface behind the
 * + action, not a description of one. Deliberately not a post composer.
 *
 * All three are live. The non-link branch below is kept because the row
 * shape should not have to be rebuilt when a future creation path arrives
 * before its workflow does.
 */
const OPTIONS = [
  {
    icon: CalendarPlus,
    color: 'var(--color-cause-sage)',
    title: 'Create an opportunity',
    body: 'Organize a cleanup, a drive, or a community event and invite people to join.',
    to: '/create/opportunity',
  },
  {
    icon: HandCoins,
    color: 'var(--color-cause-amber)',
    title: 'Start a fundraiser',
    body: 'Raise support for a cause or an organization you care about.',
    to: '/create/fundraiser',
  },
  {
    icon: NotebookPen,
    color: 'var(--color-cause-blue)',
    title: 'Log activity',
    body: 'Add something you did outside Kynd so your history stays complete.',
    to: '/create/log',
  },
];

function OptionBody({ option }) {
  return (
    <>
      <span
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${option.color} 14%, white)` }}
      >
        <option.icon
          className="h-[21px] w-[21px]"
          style={{ color: option.color }}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[17px] font-semibold text-ink group-hover:text-brand">
          {option.title}
        </span>
        <span className="mt-1 block text-[15px] leading-relaxed text-ink-muted">{option.body}</span>
      </span>
      {option.to && (
        <ChevronRight
          className="mt-2 h-5 w-5 flex-shrink-0 text-ink-subtle"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
    </>
  );
}

function Create() {
  return (
    <PageContainer width="narrow">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">Create</h1>
      <p className="mt-1.5 text-[16px] text-ink-muted">What would you like to start?</p>

      <div className="mt-7 flex flex-col">
        {OPTIONS.map((option) =>
          option.to ? (
            <Link
              key={option.title}
              to={option.to}
              className="group flex items-start gap-4 border-b border-line py-5 first:border-t"
            >
              <OptionBody option={option} />
            </Link>
          ) : (
            <div
              key={option.title}
              className="flex items-start gap-4 border-b border-line py-5 first:border-t"
            >
              <OptionBody option={option} />
            </div>
          )
        )}
      </div>

      <p className="mt-6 text-[15px] text-ink-muted">
        Kynd has no generic post composer &mdash; everything you create connects to real
        participation.
      </p>
    </PageContainer>
  );
}

export default Create;
