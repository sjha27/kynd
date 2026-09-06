import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import { CAUSES } from '../lib/causes';
import { todayInAtlanta } from '../lib/format';
import { createOpportunity } from '../api/client';
import { SensitiveInfoNotice } from '../components/demo/DemoNotice';

/*
 * Publishing an opportunity.
 *
 * This is the supply side of the marketplace: a regular person, not an
 * organization admin, organizing something and inviting people to join. The
 * form never sends a host — the backend takes it from the session — so what
 * gets published is genuinely "hosted by you".
 *
 * No image field: there is no upload infrastructure, and the app's
 * deterministic cause-keyed media resolution already gives every opportunity
 * a real photograph. Asking for one and then ignoring it would be a lie.
 */
const TYPES = [
  { value: 'volunteer', label: 'Volunteer opportunity' },
  { value: 'charity_event', label: 'Charity event' },
];

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

function CreateOpportunity() {
  const navigate = useNavigate();
  const today = todayInAtlanta();

  const [form, setForm] = useState({
    title: '',
    type: 'volunteer',
    causeName: CAUSES[0].name,
    description: '',
    date: '',
    startTime: '09:00',
    endTime: '12:00',
    isOnline: false,
    locationName: '',
    city: 'Atlanta',
    state: 'GA',
    capacity: '20',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;

    const capacity = Number(form.capacity);
    if (!form.title.trim()) return setError('Give your opportunity a title.');
    if (!form.description.trim()) return setError('Add a short description so people know what this is.');
    if (!form.date) return setError('Choose the date this happens.');
    if (form.date < today) return setError('Pick a date that has not already passed.');
    if (form.endTime <= form.startTime) return setError('The end time must be after the start time.');
    if (!Number.isInteger(capacity) || capacity < 1) {
      return setError('Enter how many people can take part.');
    }
    if (!form.isOnline && !form.locationName.trim()) {
      return setError('Add where this is happening, or mark it as online.');
    }

    setPending(true);
    setError(null);
    try {
      const { opportunity } = await createOpportunity({
        title: form.title.trim(),
        type: form.type,
        causeName: form.causeName,
        description: form.description.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        isOnline: form.isOnline,
        locationName: form.isOnline ? null : form.locationName.trim(),
        city: form.isOnline ? null : form.city.trim(),
        state: form.isOnline ? null : form.state.trim(),
        capacity,
      });
      // Straight to the real thing that now exists, not a confirmation screen.
      navigate(`/opportunities/${opportunity.id}`);
    } catch (err) {
      setError(err.message || "We couldn't publish that. Please try again.");
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
        Create an opportunity
      </h1>
      <p className="mt-1.5 text-[16px] text-ink-muted">
        Organize something in your community. You&rsquo;ll be listed as the host.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-5">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            maxLength={120}
            placeholder="Saturday morning creek cleanup"
            className={FIELD_CLASSES}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select value={form.type} onChange={set('type')} className={FIELD_CLASSES}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={4}
            maxLength={2000}
            placeholder="What will people be doing, and what should they bring?"
            className={`${FIELD_CLASSES} resize-none leading-relaxed`}
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Date">
            <input
              type="date"
              value={form.date}
              onChange={set('date')}
              min={today}
              className={FIELD_CLASSES}
            />
          </Field>
          <Field label="Starts">
            <input
              type="time"
              value={form.startTime}
              onChange={set('startTime')}
              className={FIELD_CLASSES}
            />
          </Field>
          <Field label="Ends">
            <input
              type="time"
              value={form.endTime}
              onChange={set('endTime')}
              className={FIELD_CLASSES}
            />
          </Field>
        </div>

        <div>
          <span className="text-[13px] font-semibold text-ink">Where</span>
          <div className="mt-2 flex gap-2">
            {[
              { online: false, label: 'In person' },
              { online: true, label: 'Online' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={form.isOnline === option.online}
                onClick={() => setForm((prev) => ({ ...prev, isOnline: option.online }))}
                className={`min-h-[40px] rounded-control border px-4 text-[14px] font-medium transition-colors ${
                  form.isOnline === option.online
                    ? 'border-brand bg-brand text-white'
                    : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* An online opportunity genuinely has no physical location, so the
            fields disappear rather than sitting there disabled. */}
        {!form.isOnline && (
          <div className="space-y-5">
            <Field label="Location">
              <input
                type="text"
                value={form.locationName}
                onChange={set('locationName')}
                maxLength={120}
                placeholder="Piedmont Park, 12th Street entrance"
                className={FIELD_CLASSES}
              />
            </Field>
            <div className="grid grid-cols-[1fr_100px] gap-4">
              <Field label="City">
                <input
                  type="text"
                  value={form.city}
                  onChange={set('city')}
                  maxLength={120}
                  className={FIELD_CLASSES}
                />
              </Field>
              <Field label="State">
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))
                  }
                  maxLength={2}
                  className={FIELD_CLASSES}
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="How many people can join?" hint="You can host up to 500 people.">
          <input
            type="number"
            value={form.capacity}
            onChange={set('capacity')}
            min="1"
            max="500"
            step="1"
            className={`${FIELD_CLASSES} w-32`}
          />
        </Field>

        <SensitiveInfoNotice />

        {error && (
          <p role="alert" className="text-[14px] text-accent">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? 'Publishing…' : 'Publish'}
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

export default CreateOpportunity;
