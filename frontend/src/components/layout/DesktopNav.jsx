import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import KyndMark from '../brand/KyndMark';
import NavItem from './NavItem';
import { NAV_ITEMS } from '../../lib/nav';
import ResetDemo from '../demo/ResetDemo';

/*
 * Left rail: light, chrome-free, sitting directly on the cream frame.
 * No panel background, no bordered nav items — the rail is negative space
 * holding the brand and five destinations.
 *
 * Create is a pill rather than a full-width brown block: present and
 * clearly the primary action, without becoming the loudest object on the
 * screen. It opens Kynd's three creation paths, never a post composer.
 */
function DesktopNav() {
  const items = NAV_ITEMS.filter((item) => item.key !== 'create');

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-screen w-[212px] flex-shrink-0 flex-col px-5 py-6 lg:flex xl:w-[236px]"
    >
      <NavLink to="/" className="mb-8 inline-flex self-start px-1" aria-label="Kynd, go to home">
        <KyndMark variant="wordmark" size="lg" />
      </NavLink>

      <div className="flex flex-col gap-1">
        {items.slice(0, 2).map((item) => (
          <NavItem
            key={item.key}
            to={item.path}
            icon={item.icon}
            label={item.label}
            end={item.path === '/'}
          />
        ))}
        {items.slice(2).map((item) => (
          <NavItem key={item.key} to={item.path} icon={item.icon} label={item.label} />
        ))}
      </div>

      <NavLink
        to="/create"
        className={({ isActive }) =>
          [
            'mt-6 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold text-white transition-colors',
            isActive ? 'bg-brand-press' : 'bg-brand hover:bg-brand-hover active:bg-brand-press',
          ].join(' ')
        }
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
        Create
      </NavLink>

      {/* Demo scaffolding lives at the foot of the rail, where a real
          product would keep account settings — present, but never
          competing with the product's own actions. */}
      <div className="mt-auto pt-6">
        <ResetDemo />
      </div>
    </nav>
  );
}

export default DesktopNav;
