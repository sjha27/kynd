import { CalendarPlus, HandCoins, NotebookPen } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';

/*
 * Kynd's three creation paths — this is the real product surface behind the
 * + action, not a description of one. Deliberately not a post composer.
 *
 * The workflows are out of scope for the shell, so the rows are
 * non-interactive and say so, rather than being buttons that go nowhere.
 */
const OPTIONS = [
  {
    icon: CalendarPlus,
    color: 'var(--color-cause-sage)',
    title: 'Create an opportunity',
    body: 'Organize a cleanup, a drive, or a community event and invite people to join.',
  },
  {
    icon: HandCoins,
    color: 'var(--color-cause-amber)',
    title: 'Start a fundraiser',
    body: 'Raise support for a cause or an organization you care about.',
  },
  {
    icon: NotebookPen,
    color: 'var(--color-cause-blue)',
    title: 'Log activity',
    body: 'Add something you did outside Kynd so your history stays complete.',
  },
];

function Create() {
  return (
    <PageContainer width="narrow">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">Create</h1>
      <p className="mt-1.5 text-[16px] text-ink-muted">What would you like to start?</p>

      <div className="mt-7 flex flex-col">
        {OPTIONS.map((option) => (
          <div
            key={option.title}
            className="flex items-start gap-4 border-b border-line py-5 first:border-t"
          >
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
            <div className="min-w-0 pt-0.5">
              <h2 className="text-[17px] font-semibold text-ink">{option.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{option.body}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[15px] text-ink-muted">
        These open in a later build. Kynd has no generic post composer &mdash; everything you create
        connects to real participation.
      </p>
    </PageContainer>
  );
}

export default Create;
