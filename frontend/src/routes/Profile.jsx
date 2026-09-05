import { UserRound } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Avatar from '../components/ui/Avatar';
import Photo from '../components/ui/Photo';
import EmptyState from '../components/ui/EmptyState';

/*
 * Profile is the identity surface. There is no authentication or demo
 * session yet, so there is no person to render.
 *
 * The cover-and-avatar composition is established because that hierarchy is
 * the durable part. The four objective metrics (hours, activities,
 * organizations, raised) are deliberately absent rather than shown as
 * placeholders — empty metric slots read as broken data, and the real
 * treatment belongs with the Profile slice and real values.
 */
function Profile() {
  return (
    <>
      {/* No cover asset exists, so Photo renders its neutral panel rather
          than a broken image or filler stock photography. */}
      <Photo ratio="3/2" className="!aspect-[3/1] lg:!aspect-[4/1]" alt="" />

      <PageContainer width="narrow" className="!pt-0">
        <div className="-mt-11 lg:-mt-14">
          <Avatar name={null} size="lg" className="ring-4 ring-surface lg:h-28 lg:w-28" />
        </div>

        <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] text-ink lg:text-[30px]">
          Your profile
        </h1>
        <p className="mt-1.5 text-[16px] text-ink-muted">
          Signing in isn&rsquo;t part of the demo yet.
        </p>

        <div className="mt-2 border-t border-line">
          <EmptyState
            icon={UserRound}
            title="Your contribution history lives here"
            description="The causes you show up for, the organizations you support, and the activities you take part in build a profile over time. Kynd keeps the record, never a score."
          />
        </div>
      </PageContainer>
    </>
  );
}

export default Profile;
