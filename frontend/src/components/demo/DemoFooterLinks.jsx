import { NavLink } from 'react-router-dom';

/*
 * Transparency links, kept quiet.
 *
 * These have to be reachable from anywhere — someone can deep-link straight
 * into an opportunity and never pass a landing page — but they must not
 * compete with Discover, Create, Join or Support. Small, greyed, and at the
 * foot of whatever contains them.
 */
const LINKS = [
  { to: '/demo-info', label: 'About this demo' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
];

function DemoFooterLinks({ className = '' }) {
  return (
    <nav aria-label="About Kynd" className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            `text-[12px] transition-colors hover:text-ink ${
              isActive ? 'font-semibold text-ink' : 'text-ink-subtle'
            }`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default DemoFooterLinks;
