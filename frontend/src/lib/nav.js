import { Home, Compass, Plus, Clock, CircleUser } from 'lucide-react';

// Single source of truth for the five primary destinations, shared by the
// desktop left rail and the mobile bottom nav so they can't drift apart.
export const NAV_ITEMS = [
  { key: 'home', label: 'Home', path: '/', icon: Home },
  { key: 'discover', label: 'Discover', path: '/discover', icon: Compass },
  { key: 'create', label: 'Create', path: '/create', icon: Plus },
  { key: 'activity', label: 'Activity', path: '/activity', icon: Clock },
  { key: 'profile', label: 'Profile', path: '/profile', icon: CircleUser },
];
