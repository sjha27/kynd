import PageContainer from '../components/layout/PageContainer';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import UserProfile from './UserProfile';
import { useDemoSession } from '../session/DemoSessionProvider';

/*
 * Your own profile is exactly the UserProfile surface everyone else's uses —
 * identity, causes, objective metrics and Impact History — addressed by the
 * current session's own user id instead of a route param. One component, so
 * your page and Maya's are the same page, which is what makes the
 * difference between them purely a difference in what each person has
 * actually done.
 */
function ProfileSkeleton() {
  return (
    <PageContainer width="wide">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
        <div>
          <Skeleton className="h-24 w-24" rounded="full" />
          <Skeleton className="mt-4 h-6 w-44" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
        <div className="mt-10 lg:mt-0">
          <SkeletonText lines={5} />
        </div>
      </div>
    </PageContainer>
  );
}

function Profile() {
  const { status, session } = useDemoSession();

  if (status !== 'ready' || !session?.user?.id) {
    return <ProfileSkeleton />;
  }

  return <UserProfile id={session.user.id} />;
}

export default Profile;
