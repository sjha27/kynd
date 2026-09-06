import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import PageContainer from './components/layout/PageContainer';
import { SkeletonText } from './components/ui/Skeleton';
import Home from './routes/Home';
import Discover from './routes/Discover';

/*
 * Home and Discover load eagerly: one of them is the first thing essentially
 * every visitor sees, so splitting them would only add a round trip to the
 * first paint.
 *
 * Everything else is fetched when it is first opened. These are real
 * destinations a visitor reaches deliberately — an opportunity, a profile, a
 * creation form, the transparency pages — and none of them belongs in the
 * bundle that has to arrive before the app can render at all.
 */
const OpportunityDetail = lazy(() => import('./routes/OpportunityDetail'));
const FundraiserDetail = lazy(() => import('./routes/FundraiserDetail'));
const UserProfile = lazy(() => import('./routes/UserProfile'));
const OrganizationDetail = lazy(() => import('./routes/OrganizationDetail'));
const Create = lazy(() => import('./routes/Create'));
const CreateOpportunity = lazy(() => import('./routes/CreateOpportunity'));
const CreateFundraiser = lazy(() => import('./routes/CreateFundraiser'));
const LogActivity = lazy(() => import('./routes/LogActivity'));
const Activity = lazy(() => import('./routes/Activity'));
const Profile = lazy(() => import('./routes/Profile'));
const DemoInfo = lazy(() => import('./routes/DemoInfo'));
const Privacy = lazy(() => import('./routes/Privacy'));
const Terms = lazy(() => import('./routes/Terms'));
const DevStatus = lazy(() => import('./routes/DevStatus'));

/*
 * Shown only for the moment a route chunk is in flight. Deliberately the
 * same quiet skeleton language the routes use for their own data, so a slow
 * connection sees one consistent loading idiom rather than a spinner
 * followed by a skeleton.
 */
function RouteFallback() {
  return (
    <PageContainer width="narrow">
      <SkeletonText lines={4} />
    </PageContainer>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route
          element={
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          }
        >
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/users/:id" element={<UserProfile />} />
          <Route path="/organizations/:id" element={<OrganizationDetail />} />
          <Route path="/fundraisers/:id" element={<FundraiserDetail />} />
          <Route path="/create" element={<Create />} />
          <Route path="/create/opportunity" element={<CreateOpportunity />} />
          <Route path="/create/fundraiser" element={<CreateFundraiser />} />
          <Route path="/create/log" element={<LogActivity />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/demo-info" element={<DemoInfo />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/dev/status" element={<DevStatus />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
