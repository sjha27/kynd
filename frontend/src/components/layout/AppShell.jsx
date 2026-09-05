import { Outlet, useLocation } from 'react-router-dom';
import DesktopNav from './DesktopNav';
import MobileNav from './MobileNav';
import RightRail from './RightRail';
import KyndMark from '../brand/KyndMark';
import { NAV_ITEMS } from '../../lib/nav';

/*
 * The frame every route inherits.
 *
 * Composition: the cream canvas is the FRAME (rails + page background).
 * The center column is white and runs full-bleed to its own edges, so the
 * product reads as one bright content region rather than pale cards
 * floating on beige. Center is also the widest column by a clear margin —
 * it should obviously be where the product lives, not one of three equal
 * administrative panes.
 *
 *   < lg   bottom nav only, content full width
 *   >= lg  left rail + center
 *   >= xl  left rail + center + community rail
 */
/*
 * Marketplace surfaces claim the right rail's width instead of competing
 * with it. Discover does its own cause browsing, so the rail's cause list
 * would be duplicate content; detail pages want the width for photography.
 */
function usesFullWidth(pathname) {
  return pathname === '/discover' || pathname.startsWith('/opportunities/');
}

function AppShell() {
  const { pathname } = useLocation();
  const showBrandBar = pathname === '/';
  const routeLabel = NAV_ITEMS.find((item) => item.path === pathname)?.label;
  const fullWidth = usesFullWidth(pathname);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <DesktopNav />

        <div className="flex min-w-0 flex-1 flex-col border-line bg-surface lg:border-x">
          {showBrandBar && (
            <header className="flex items-center px-4 py-3 lg:hidden">
              <KyndMark variant="wordmark" size="md" />
            </header>
          )}

          <main className="flex-1 pb-28 lg:pb-0" aria-label={routeLabel ?? 'Main content'}>
            <Outlet />
          </main>
        </div>

        {!fullWidth && <RightRail />}
      </div>

      <MobileNav />
    </div>
  );
}

export default AppShell;
