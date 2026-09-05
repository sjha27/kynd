import { NavLink } from 'react-router-dom';

/*
 * Consumer-app navigation, not a SaaS sidebar: no container chrome, larger
 * icons, and an active state carried by weight + brown ink rather than a
 * filled box. Weight and icon stroke both change with state, so the cue is
 * never color alone.
 */
function NavItem({ to, icon: Icon, label, orientation = 'horizontal', end = false }) {
  const isVertical = orientation === 'vertical';

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center rounded-full transition-colors',
          isVertical
            ? 'min-h-[48px] min-w-[56px] flex-col justify-center gap-1 px-2'
            : 'min-h-[46px] gap-3.5 px-3 py-2',
          isActive
            ? 'text-brand'
            : 'text-ink-muted hover:text-ink lg:hover:bg-black/[0.035]',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={isVertical ? 'h-[23px] w-[23px]' : 'h-[23px] w-[23px]'}
            strokeWidth={isActive ? 2.4 : 1.75}
            aria-hidden="true"
          />
          <span
            className={[
              isVertical ? 'text-[11px] leading-none' : 'text-[15.5px]',
              isActive ? 'font-bold' : 'font-medium',
            ].join(' ')}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export default NavItem;
