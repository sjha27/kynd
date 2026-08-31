const CAUSES = [
  'Environment',
  'Food & Hunger',
  'Animals',
  'Education',
  'Health',
  'Housing',
  'Youth',
  'Disaster Relief',
  'Community',
  'Veterans',
];

const FIRST_NAMES = [
  'Avery', 'Jordan', 'Taylor', 'Cameron', 'Morgan',
  'Riley', 'Ethan', 'Sofia', 'Noah', 'Amara',
  'Lucas', 'Mia', 'Elijah', 'Nina', 'Caleb',
  'Leah', 'Mateo', 'Zoe', 'Miles', 'Priya',
  'Owen', 'Lena', 'Marcus', 'Naomi', 'Julian',
  'Aisha', 'Henry', 'Claire', 'Andre', 'Elena',
  'Sam', 'Jasmine', 'Daniel', 'Grace', 'Isaac',
  'Talia', 'Theo', 'Maya', 'David', 'Olivia',
];

const LAST_NAMES = [
  'Ellis', 'Mercer', 'Patel', 'Kim', 'Johnson',
  'Nguyen', 'Brooks', 'Rivera', 'Shah', 'Turner',
  'Martin', 'Chen', 'Reed', 'Davis', 'Walker',
  'Flores', 'Singh', 'Bennett', 'Coleman', 'Murphy',
  'Parker', 'Diaz', 'Foster', 'Morgan', 'Bell',
  'Bailey', 'Ward', 'Ross', 'Cooper', 'Howard',
  'Price', 'Jenkins', 'Powell', 'Long', 'Sanders',
  'Bryant', 'Perry', 'Russell', 'Griffin', 'Hayes',
];

const ATLANTA_METRO_LOCATIONS = [
  { city: 'Atlanta', state: 'GA' },
  { city: 'Decatur', state: 'GA' },
  { city: 'Sandy Springs', state: 'GA' },
  { city: 'Brookhaven', state: 'GA' },
  { city: 'Marietta', state: 'GA' },
  { city: 'Smyrna', state: 'GA' },
  { city: 'Roswell', state: 'GA' },
  { city: 'Alpharetta', state: 'GA' },
];

const GEORGIA_LOCATIONS = [
  { city: 'Athens', state: 'GA' },
  { city: 'Savannah', state: 'GA' },
  { city: 'Augusta', state: 'GA' },
  { city: 'Macon', state: 'GA' },
  { city: 'Columbus', state: 'GA' },
];

const ORGANIZATION_PREFIXES = [
  'BrightPath',
  'Cedar Bridge',
  'Common Ground',
  'Evergreen',
  'Forward Together',
  'Good Neighbor',
  'Harborlight',
  'Kindred',
  'Mosaic',
  'New Leaf',
  'Open Door',
  'Peachtree',
  'Riverstone',
  'Sunrise',
  'Community Roots',
  'Northstar',
  'Gather',
  'Bridgeway',
  'Hopewell',
  'Cornerstone',
];

const ORGANIZATION_NOUNS = [
  'Collective',
  'Network',
  'Project',
  'Alliance',
  'Initiative',
  'Foundation',
  'Community',
  'Partners',
  'Works',
  'Collaborative',
  'Coalition',
  'Neighbors',
  'Action Group',
  'Center',
  'Circle',
  'Corps',
  'Hub',
  'Outreach',
  'Commons',
  'Connection',
];

const USER_BIOS = {
  light: [
    'Looking for simple ways to give back around Atlanta.',
    'Trying to make community involvement part of my routine.',
    'Interested in local causes, good people, and meaningful weekends.',
  ],
  regular: [
    'Community-minded and always looking for the next way to help.',
    'Usually somewhere between a volunteer shift and a neighborhood event.',
    'I care about showing up consistently for causes close to home.',
  ],
  highly_active: [
    'Volunteer, organizer, and believer in stronger local communities.',
    'Most weekends are better when they include a little service.',
    'Connecting people with causes and turning good intentions into action.',
  ],
  connector: [
    'Bringing people, organizations, and neighborhoods together through service.',
    'Community organizer focused on helping more people find a place to contribute.',
    'Building stronger communities one project, event, and introduction at a time.',
  ],
};

module.exports = {
  CAUSES,
  FIRST_NAMES,
  LAST_NAMES,
  ATLANTA_METRO_LOCATIONS,
  GEORGIA_LOCATIONS,
  ORGANIZATION_PREFIXES,
  ORGANIZATION_NOUNS,
  USER_BIOS,
};
