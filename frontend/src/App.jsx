import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Home from './routes/Home';
import Discover from './routes/Discover';
import Create from './routes/Create';
import LogActivity from './routes/LogActivity';
import CreateOpportunity from './routes/CreateOpportunity';
import CreateFundraiser from './routes/CreateFundraiser';
import FundraiserDetail from './routes/FundraiserDetail';
import Activity from './routes/Activity';
import Profile from './routes/Profile';
import OpportunityDetail from './routes/OpportunityDetail';
import UserProfile from './routes/UserProfile';
import OrganizationDetail from './routes/OrganizationDetail';
import DevStatus from './routes/DevStatus';
import DemoInfo from './routes/DemoInfo';
import Privacy from './routes/Privacy';
import Terms from './routes/Terms';

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/users/:id" element={<UserProfile />} />
        <Route path="/organizations/:id" element={<OrganizationDetail />} />
        <Route path="/create" element={<Create />} />
        <Route path="/fundraisers/:id" element={<FundraiserDetail />} />
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
    </Routes>
  );
}

export default App;
