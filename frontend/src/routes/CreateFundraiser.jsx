import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import { CAUSES } from '../lib/causes';
import { todayInAtlanta } from '../lib/format';
import { createFundraiser } from '../api/client';
import { SensitiveInfoNotice } from '../components/demo/DemoNotice';
import Field, { FIELD_CLASSES } from '../components/ui/Field';

/*
 * Starting a fundraiser.
 *
 * The form never sends a creator — the backend takes it from the session —
 * so what gets published is genuinely "organized by you". Goal is entered in
 * dollars because that is how a person thinks about it, and converted to the
 * integer cents the API and database use before it leaves the browser.
 *
 * No image field: media resolves deterministically from the fundraiser's id
 * and cause, and there is no upload infrastructure to back one.
 */
// The earliest end date a new fundraiser can have is tomorrow: an open
// fundraiser that ends today is already over.
function tomorrowInAtlanta() {
  const [y, m, d] = todayInAtlanta().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function CreateFundraiser() {
  const navigate = useNavigate();
  const earliestEnd = tomorrowInAtlanta();

  const [form, setForm] = useState({
    title: '',
    beneficiaryName: '',
    causeName: CAUSES[0].name,
    story: '',
    goalDollars: '2500',
    endDate: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;

    const dollars = Number(form.goalDollars);
    if (!form.title.trim()) return setError('Give your fundraiser a title.');
    if (!form.beneficiaryName.trim()) return setError('Say who this fundraiser benefits.');
    if (!form.story.trim()) return setError('Add a short story so people know why this matters.');
    if (!Number.isFinite(dollars) || dollars <= 0) return setError('Enter a goal above zero.');
    if (!form.endDate) return setError('Choose when this fundraiser ends.');
    if (form.endDate < earliestEnd) return setError('The end date must be in the future.');

    setPending(true);
    setError(null);
    try {
      const { fundraiser } = await createFundraiser({
        title: form.title.trim(),
        beneficiaryName: form.beneficiaryName.trim(),
        causeName: form.causeName,
        story: form.story.trim(),
        // Money is integer cents from here on, everywhere.
        goalAmountCents: Math.round(dollars * 100),
        endDate: form.endDate,
      });
      navigate(`/fundraisers/${fundraiser.id}`);
    } catch (err) {
      setError(err.message || "We couldn't start that fundraiser. Please try again.");
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
        Start a fundraiser
      </h1>
      <p className="mt-1.5 text-[16px] text-ink-muted">
        Raise support for a cause or an organization you care about.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-5">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            maxLength={120}
            placeholder="Winter coats for west side families"
            className={FIELD_CLASSES}
          />
        </Field>

        <Field label="Who does this benefit?" hint="If they're on Kynd, we'll link to their page.">
          <input
            type="text"
            value={form.beneficiaryName}
            onChange={set('beneficiaryName')}
            maxLength={120}
            placeholder="Mosaic Meals Collective"
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

        <Field label="Story">
          <textarea
            value={form.story}
            onChange={set('story')}
            rows={5}
            maxLength={4000}
            placeholder="What are you raising for, and what will it make possible?"
            className={`${FIELD_CLASSES} resize-none leading-relaxed`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Goal">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-muted">
                $
              </span>
              <input
                type="number"
                value={form.goalDollars}
                onChange={set('goalDollars')}
                min="1"
                step="1"
                className={`${FIELD_CLASSES} pl-7`}
              />
            </div>
          </Field>

          <Field label="Ends on">
            <input
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              min={earliestEnd}
              className={FIELD_CLASSES}
            />
          </Field>
        </div>

        <SensitiveInfoNotice />

        {error && (
          <p role="alert" className="text-[14px] text-accent">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? 'Starting…' : 'Start fundraiser'}
          </Button>
          <button
            type="button"
            onClick={() => navigate('/create')}
            className="text-[14px] font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-subtle">
          Support on Kynd is simulated for this demo. No payments are processed and no money moves.
        </p>
      </form>
    </PageContainer>
  );
}

export default CreateFundraiser;
