import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Home from './routes/Home';
import Discover from './routes/Discover';
import Create from './routes/Create';
import Activity from './routes/Activity';
import Profile from './routes/Profile';
import OpportunityDetail from './routes/OpportunityDetail';
import DevStatus from './routes/DevStatus';

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/create" element={<Create />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/dev/status" element={<DevStatus />} />
      </Route>
    </Routes>
  );
}

export default App;
