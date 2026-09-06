import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import Avatar from '../ui/Avatar';
import OrgMark from '../ui/OrgMark';
import OpportunityCard from '../opportunity/OpportunityCard';
import { avatarImage } from '../../lib/media';
import { sourceForHomeFamily } from '../../lib/analytics';

/*
 * Renders the three opportunity-shaped feed families (personUpcoming,
 * orgOpportunity, causeDiscovery) as one header line plus the existing
 * OpportunityCard — the same truthful, session-scoped opportunity object
 * Discover and Opportunity Detail already use. No Join button here: the
 * journey stays Home -> social context -> Opportunity Detail -> Join.
 */
function HomeFeedItem({ item }) {
  const { family, header, opportunity } = item;

  let avatarHref = null;
  let avatarNode = null;

  if (family === 'personUpcoming') {
    const person = item.people[0];
    avatarHref = `/users/${person.id}`;
    avatarNode = <Avatar name={person.name} src={avatarImage(person)} size="sm" />;
  } else if (family === 'orgOpportunity') {
    avatarHref = `/organizations/${item.organization.id}`;
    avatarNode = <OrgMark name={item.organization.name} causeName={opportunity.cause.name} size="sm" />;
  }

  return (
    <li className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <div className="mb-3 flex items-center gap-2.5">
        {avatarHref ? (
          <Link
            to={avatarHref}
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
          >
            {avatarNode}
            <span className="truncate text-[14px] font-semibold text-ink">{header}</span>
          </Link>
        ) : (
          <span className="text-[14px] font-semibold text-ink-muted">{header}</span>
        )}

        {/* Derived server-side from the session; never inferred here. */}
        {opportunity.viewerJoined && (
          <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-cause-sage px-2.5 py-1 text-[12px] font-semibold text-white">
            <Check className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />
            You&rsquo;re going
          </span>
        )}
      </div>

      <OpportunityCard opportunity={opportunity} source={sourceForHomeFamily(family)} />
    </li>
  );
}

export default HomeFeedItem;
