import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api/client';

// Anchor record used only to know which opportunity to request. The values
// rendered below always come from the API response, never from this ID.
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
    <section className="card">
      <h2>{title}</h2>
      {check.status === 'loading' && <p className="state state-loading">Loading…</p>}
      {check.status === 'error' && (
        <div className="state state-error">
          <p>Request failed: {check.error}</p>
          <button type="button" onClick={check.retry}>
            Retry
          </button>
        </div>
      )}
      {check.status === 'success' && (
        <div className="state state-success">{children(check.data)}</div>
      )}
    </section>
  );
}

function FlagshipOpportunity({ opportunity }) {
  return (
    <dl className="fields">
      <div>
        <dt>Title</dt>
        <dd>{opportunity.title}</dd>
      </div>
      <div>
        <dt>Host</dt>
        <dd>{opportunity.host?.name}</dd>
      </div>
      <div>
        <dt>Cause</dt>
        <dd>{opportunity.cause?.name}</dd>
      </div>
      <div>
        <dt>Capacity</dt>
        <dd>{opportunity.capacity}</dd>
      </div>
      <div>
        <dt>Joined</dt>
        <dd>{opportunity.participants?.joined}</dd>
      </div>
      <div>
        <dt>Available</dt>
        <dd>{opportunity.participants?.available}</dd>
      </div>
    </dl>
  );
}

function App() {
  const health = useApiCheck('/api/health');
  const ready = useApiCheck('/api/ready');
  const flagship = useApiCheck(`/api/v1/opportunities/${FLAGSHIP_OPPORTUNITY_ID}`);

  const retryAll = () => {
    health.retry();
    ready.retry();
    flagship.retry();
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Kynd — Connectivity Checkpoint</h1>
        <p className="notice">
          Temporary development page, not the Kynd product UI. It exists to
          prove React → Express → Neon connectivity ahead of deployment.
        </p>
        <button type="button" onClick={retryAll}>
          Retry all checks
        </button>
      </header>

      <CheckCard title="API Health" check={health}>
        {(body) => <p>status: {body.status}</p>}
      </CheckCard>

      <CheckCard title="Database Readiness" check={ready}>
        {(body) => <p>status: {body.status}</p>}
      </CheckCard>

      <CheckCard title="Flagship Opportunity" check={flagship}>
        {(body) => <FlagshipOpportunity opportunity={body.opportunity} />}
      </CheckCard>
    </main>
  );
}

export default App;
