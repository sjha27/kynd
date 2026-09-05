import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import { CAUSES } from '../lib/causes';
import { logActivity } from '../api/client';

/*
 * Manual activity logging.
 *
 * Kynd should remember contribution that happened outside Kynd, not only
 * what was booked through it — so this form takes an activity the visitor
 * did anywhere and turns it into a real entry in their history.
 *
 * Deliberately one plain form, not a wizard. Organization is a single free
 * text field: if what they type matches an organization on Kynd, the backend
 * links it and the entry gains a real host; otherwise it is remembered as an
 * external organization, which is an equally valid answer. The client never
 * sends an organization id — resolving the name is the backend's job.
 */

// Today in Atlanta, as YYYY-MM-DD, so the date input can't offer a future
// day. The backend re-checks this against the real database clock; this is
// only here to keep the control honest.
function todayInAtlanta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

const FIELD_CLASSES =
  'mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-ink-muted">{hint}</span>}
    </label>
  );
}

function LogActivity() {
  const navigate = useNavigate();
  const today = todayInAtlanta();

  const [form, setForm] = useState({
    title: '',
    organizationName: '',
    causeName: CAUSES[0].name,
    occurredOn: today,
    hours: '',
    story: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;

    const hours = Number(form.hours);
    if (!form.title.trim()) return setError('Give this activity a title.');
    if (!form.organizationName.trim()) return setError('Add who you did this with.');
    if (!form.occurredOn) return setError('Choose the date this happened.');
    if (form.occurredOn > today) return setError("Pick a date that isn't in the future.");
    if (!Number.isFinite(hours) || hours <= 0) return setError('Enter a valid number of hours.');

    setPending(true);
    setError(null);
    try {
      await logActivity({
        title: form.title.trim(),
        causeName: form.causeName,
        organizationName: form.organizationName.trim(),
        occurredOn: form.occurredOn,
        hours,
        story: form.story.trim() || null,
      });
      // Land on the history this just became part of, rather than a
      // success screen that says so.
      navigate('/activity', { state: { tab: 'completed' } });
    } catch (err) {
      setError(err.message || "We couldn't save that. Please try again.");
      setPending(false);
    }
  };

  return (
    <PageContainer width="narrow">
      <button
        type="button"
        onClick={() => navigate('/create')}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Create
      </button>

      <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">
        Log activity
      </h1>
      <p className="mt-1.5 text-[16px] text-ink-muted">
        Add something you did outside Kynd so your history stays complete.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-5">
        <Field label="What did you do?">
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            maxLength={120}
            placeholder="Saturday shift at the food pantry"
            className={FIELD_CLASSES}
          />
        </Field>

        <Field
          label="Organization"
          hint="If they're on Kynd, we'll link this to their page."
        >
          <input
            type="text"
            value={form.organizationName}
            onChange={set('organizationName')}
            maxLength={120}
            placeholder="Riverlight Atlanta"
            className={FIELD_CLASSES}
          />
        </Field>

        <Field label="Cause">
          <select value={form.causeName} onChange={set('causeName')} className={FIELD_CLASSES}>
            {CAUSES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input
              type="date"
              value={form.occurredOn}
              onChange={set('occurredOn')}
              max={today}
              className={FIELD_CLASSES}
            />
          </Field>

          <Field label="Hours">
            <input
              type="number"
              value={form.hours}
              onChange={set('hours')}
              min="0.5"
              max="24"
              step="0.5"
              placeholder="2"
              className={FIELD_CLASSES}
            />
          </Field>
        </div>

        <Field label="Story (optional)">
          <textarea
            value={form.story}
            onChange={set('story')}
            rows={3}
            maxLength={1000}
            placeholder="How did it go?"
            className={`${FIELD_CLASSES} resize-none leading-relaxed`}
          />
        </Field>

        {error && (
          <p role="alert" className="text-[14px] text-accent">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add to Kynd'}
          </Button>
          <button
            type="button"
            onClick={() => navigate('/create')}
            className="text-[14px] font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </PageContainer>
  );
}

export default LogActivity;
