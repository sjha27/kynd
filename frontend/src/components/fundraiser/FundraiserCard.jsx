import { Link } from 'react-router-dom';
import Photo from '../ui/Photo';
import FundraiserProgress from './FundraiserProgress';
import { fundraiserImage } from '../../lib/media';
import { causeColor } from '../../lib/causes';

/*
 * A fundraiser as it appears in a row of them. Same card language as
 * OpportunityCard — photo, cause, title, then the one line that matters for
 * deciding — so the two objects read as members of one product rather than
 * two different apps.
 */
function FundraiserCard({ fundraiser, source }) {
  return (
    <Link
      to={`/fundraisers/${fundraiser.id}`}
      state={source ? { source } : undefined}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-[0_2px_16px_rgba(0,0,0,0.07)]"
    >
      <Photo src={fundraiserImage(fundraiser)} alt="" ratio="3/2" />

      <div className="flex flex-1 flex-col p-4">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.07em]"
          style={{ color: causeColor(fundraiser.cause?.name) }}
        >
          {fundraiser.cause?.name}
        </span>

        <h3 className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug text-ink group-hover:text-brand">
          {fundraiser.title}
        </h3>

        <p className="mt-1 truncate text-[13px] text-ink-muted">
          For {fundraiser.beneficiary?.name}
        </p>

        <div className="mt-3.5">
          <FundraiserProgress fundraiser={fundraiser} />
        </div>
      </div>
    </Link>
  );
}

export default FundraiserCard;
