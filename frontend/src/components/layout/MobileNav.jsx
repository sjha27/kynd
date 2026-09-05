import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import NavItem from './NavItem';
import { NAV_ITEMS } from '../../lib/nav';

/*
 * True bottom navigation — the core mobile model.
 *
 * White bar against white content with a single hairline, so the chrome
 * stays quiet and the content owns the screen. The Create button is the one
 * element that floats, because it is the one element that should: it is the
 * primary action, sized for the thumb.
 */
function MobileNav() {
  const items = NAV_ITEMS.filter((item) => item.key !== 'create');

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {items.slice(0, 2).map((item) => (
          <NavItem
            key={item.key}
            to={item.path}
            icon={item.icon}
            label={item.label}
            orientation="vertical"
            end={item.path === '/'}
          />
        ))}

        <NavLink
          to="/create"
          aria-label="Create"
          className={({ isActive }) =>
            [
              '-mt-6 flex h-[56px] w-[56px] flex-shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(74,47,36,0.32)] transition-colors',
              isActive ? 'bg-brand-press' : 'bg-brand active:bg-brand-press',
            ].join(' ')
          }
        >
          <Plus className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
        </NavLink>

        {items.slice(2).map((item) => (
          <NavItem
            key={item.key}
            to={item.path}
            icon={item.icon}
            label={item.label}
            orientation="vertical"
          />
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
