import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Photo from '../components/ui/Photo';
import Avatar from '../components/ui/Avatar';
import OrgMark from '../components/ui/OrgMark';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import ErrorState from '../components/ui/ErrorState';
import FundraiserProgress from '../components/fundraiser/FundraiserProgress';
import SupportAction from '../components/fundraiser/SupportAction';
import { fetchFundraiser } from '../api/client';
import { fundraiserImage, avatarImage } from '../lib/media';
import { causeColor } from '../lib/causes';

/*
 * A fundraiser is Kynd's third core object: something someone can support.
 *
 * The page answers the questions that decide it — who is raising this, who
 * it benefits, for what cause, how far along it is, and how long is left —
 * then offers the one action. Progress is whatever the backend derived from
 * real support relationships; this page never computes a total of its own.
 */
function DetailSkeleton() {
  return (
    <PageContainer width="narrow">
      <Skeleton className="aspect-[3/2] w-full" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="mt-8">
        <SkeletonText lines={4} />
      </div>
    </PageContainer>
  );
}

function Creator({ creator, causeName }) {
  const to = creator.type === 'organization' ? `/organizations/${creator.id}` : `/users/${creator.id}`;
  return (
    <Link to={to} className="group flex items-center gap-3">
      {creator.type === 'organization' ? (
        <OrgMark name={creator.name} causeName={causeName} size="md" />
      ) : (
        <Avatar name={creator.name} src={avatarImage(creator)} size="md" />
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[15px] font-semibold text-ink group-hover:text-brand">
          <span className="truncate">{creator.name}</span>
          {creator.verified && (
            <BadgeCheck className="h-4 w-4 flex-shrink-0 text-brand" aria-label="Verified" />
          )}
        </p>
        <p className="text-[13px] text-ink-muted">
          {creator.type === 'organization' ? 'Organization' : 'Community member'}
        </p>
      </div>
    </Link>
  );
}

function FundraiserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', fundraiser: null });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: 'loading', fundraiser: null });

    fetchFundraiser(id, { signal: controller.signal })
      .then((body) => setState({ status: 'ready', fundraiser: body.fundraiser }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: err.status === 404 ? 'not-found' : 'error', fundraiser: null });
      });

    return () => controller.abort();
  }, [id]);

  useEffect(load, [load]);

  if (state.status === 'loading') return <DetailSkeleton />;

  if (state.status === 'not-found') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't find this fundraiser"
          description="It may not exist, or this link may be out of date."
        />
      </PageContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState
          title="We couldn't load this fundraiser"
          description="Something went wrong on our end. Give it another try."
          onRetry={load}
        />
      </PageContainer>
    );
  }

  const f = state.fundraiser;

  return (
    <PageContainer width="narrow">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <Photo src={fundraiserImage(f)} alt="" ratio="3/2" className="rounded-2xl" />

      <span
        className="mt-5 block text-[12px] font-bold uppercase tracking-[0.07em]"
        style={{ color: causeColor(f.cause?.name) }}
      >
        {f.cause?.name}
      </span>

      <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink lg:text-[30px]">
        {f.title}
      </h1>

      <p className="mt-2 text-[15px] text-ink-muted">
        Benefiting{' '}
        {f.beneficiary?.id ? (
          <Link
            to={`/organizations/${f.beneficiary.id}`}
            className="font-semibold text-ink hover:text-brand"
          >
            {f.beneficiary.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink">{f.beneficiary?.name}</span>
        )}
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface-sunken p-5">
        <FundraiserProgress fundraiser={f} size="lg" />
      </div>

      <div className="mt-5">
        <SupportAction
          fundraiser={f}
          onSupported={(updated) => setState({ status: 'ready', fundraiser: updated })}
        />
      </div>

      <div className="mt-7 border-t border-line pt-6">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
          Organized by
        </h2>
        <div className="mt-3">
          <Creator creator={f.creator} causeName={f.cause?.name} />
        </div>
      </div>

      <div className="mt-7 border-t border-line pt-6">
        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">The story</h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-muted">
          {f.story}
        </p>
      </div>
    </PageContainer>
  );
}

export default FundraiserDetail;
