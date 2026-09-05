import {
  Leaf,
  Utensils,
  PawPrint,
  GraduationCap,
  HeartPulse,
  Home,
  Users,
  Building2,
  Shield,
  LifeBuoy,
} from 'lucide-react';

/*
 * The ten seeded cause categories.
 *
 * Colors and icons are a shell design-system decision made here, not data
 * from the API — the category names are what match the seeded set. Until
 * photography exists, causes are where most of Kynd's color legitimately
 * comes from, so each gets a distinct identity rather than a shared grey.
 */
export const CAUSES = [
  { name: 'Environment', color: 'var(--color-cause-sage)', icon: Leaf },
  { name: 'Food & Hunger', color: 'var(--color-cause-amber)', icon: Utensils },
  { name: 'Animals', color: 'var(--color-cause-clay)', icon: PawPrint },
  { name: 'Education', color: 'var(--color-cause-blue)', icon: GraduationCap },
  { name: 'Health', color: 'var(--color-cause-teal)', icon: HeartPulse },
  { name: 'Housing', color: 'var(--color-cause-violet)', icon: Home },
  { name: 'Youth', color: 'var(--color-cause-rose)', icon: Users },
  { name: 'Community', color: 'var(--color-cause-terracotta)', icon: Building2 },
  { name: 'Veterans', color: 'var(--color-cause-blue)', icon: Shield },
  { name: 'Disaster Relief', color: 'var(--color-cause-sage)', icon: LifeBuoy },
];

const BY_NAME = new Map(CAUSES.map((c) => [c.name, c]));

export function cause(name) {
  return BY_NAME.get(name);
}

export function causeColor(name) {
  return BY_NAME.get(name)?.color ?? 'var(--color-ink-muted)';
}
