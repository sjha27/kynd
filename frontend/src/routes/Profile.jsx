import PageContainer from '../components/layout/PageContainer';
import Skeleton, { SkeletonText } from '../components/ui/Skeleton';
import UserProfile from './UserProfile';
import { useDemoSession } from '../session/DemoSessionProvider';

/*
 * Your own profile is the same UserProfile surface everyone else's profile
 * uses (identity, causes, objective metrics, and — self-only — Impact
 * History), just addressed by the current session's own user id instead of
 * a route param. This is deliberately not a redesign of the shared
 * component or of other people's profiles.
 */
function ProfileSkeleton() {
  return (
    <PageContainer width="narrow">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20" rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-8">
        <SkeletonText lines={3} />
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
