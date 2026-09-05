import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';

// Internal/debug route, not part of the consumer product surface. Proves
// browser -> Cloudflare -> Render -> Neon connectivity and doubles as a
// live check of the loading/error/retry components against real API calls.
const FLAGSHIP_OPPORTUNITY_ID = 'bc09559d-77de-5bde-b248-00a1480d6d94';

function useApiCheck(path) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(() => {
    setStatus('loading');
    setError(null);
    apiGet(path)
      .then((body) => {
        setData(body);
        setStatus('success');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [path]);

  useEffect(() => {
    run();
  }, [run]);

  return { status, data, error, retry: run };
}

function CheckCard({ title, check, children }) {
  return (
    <Card>
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <div className="mt-3">
        {check.status === 'loading' && <SkeletonText lines={2} />}
        {check.status === 'error' && (
          <ErrorState
            title="This check didn't pass"
            description="The API may be waking up from sleep. Try again in a moment."
            onRetry={check.retry}
          />
        )}
        {check.status === 'success' && children(check.data)}
      </div>
    </Card>
  );
}

function FlagshipOpportunity({ opportunity }) {
  const rows = [
    ['Title', opportunity.title],
    ['Host', opportunity.host?.name],
    ['Cause', opportunity.cause?.name],
    ['Capacity', opportunity.capacity],
    ['Joined', opportunity.participants?.joined],
    ['Available', opportunity.participants?.available],
  ];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-ink-muted">{label}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DevStatus() {
  const health = useApiCheck('/api/health');
  const ready = useApiCheck('/api/ready');
  const flagship = useApiCheck(`/api/v1/opportunities/${FLAGSHIP_OPPORTUNITY_ID}`);

  const retryAll = () => {
    health.retry();
    ready.retry();
    flagship.retry();
  };

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="System status"
        subtitle="Internal connectivity check: browser → API → database."
        action={
          <Button variant="secondary" onClick={retryAll}>
            Retry all
          </Button>
        }
      />

      <div className="mt-8 flex flex-col gap-4">
        <CheckCard title="API health" check={health}>
          {(body) => <p className="text-sm text-ink">status: {body.status}</p>}
        </CheckCard>

        <CheckCard title="Database readiness" check={ready}>
          {(body) => <p className="text-sm text-ink">status: {body.status}</p>}
        </CheckCard>

        <CheckCard title="Flagship opportunity" check={flagship}>
          {(body) => <FlagshipOpportunity opportunity={body.opportunity} />}
        </CheckCard>
      </div>
    </PageContainer>
  );
}

export default DevStatus;
