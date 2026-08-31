const EXTERNAL_FUNDRAISER_BENEFICIARIES = [
  { name: 'Eastwood Garden Collective', cause: 'Environment' },
  { name: 'South Fork Greenway Friends', cause: 'Environment' },
  { name: 'Canopy Corner Project', cause: 'Environment' },
  { name: 'Blue Heron Watershed Circle', cause: 'Environment' },
  { name: 'Southline Food Project', cause: 'Food & Hunger' },
  { name: 'Harvest Table Neighbors', cause: 'Food & Hunger' },
  { name: 'Pantry Porch Collective', cause: 'Food & Hunger' },
  { name: 'Georgia Community Kitchen', cause: 'Food & Hunger' },
  { name: 'Trailside Animal Partners', cause: 'Animals' },
  { name: 'Second Chance Foster Circle', cause: 'Animals' },
  { name: 'Pine Hollow Pet Project', cause: 'Animals' },
  { name: 'Georgia Companion Network', cause: 'Animals' },
  { name: 'Peach State Learning Circle', cause: 'Education' },
  { name: 'West End Study Partners', cause: 'Education' },
  { name: 'Curious Minds Workshop', cause: 'Education' },
  { name: 'Open Book Learning Project', cause: 'Education' },
  { name: 'WellSpring Neighborhood Care', cause: 'Health' },
  { name: 'Community Wellness Exchange', cause: 'Health' },
  { name: 'Healthy Blocks Partnership', cause: 'Health' },
  { name: 'Georgia Care Access Circle', cause: 'Health' },
  { name: 'Hearthstone Housing Project', cause: 'Housing' },
  { name: 'Stable Steps Neighbors', cause: 'Housing' },
  { name: 'Welcome Home Repair Circle', cause: 'Housing' },
  { name: 'Porchlight Housing Partners', cause: 'Housing' },
  { name: 'Next Step Youth Circle', cause: 'Youth' },
  { name: 'Young Neighbors Workshop', cause: 'Youth' },
  { name: 'Cornerstone Mentor Project', cause: 'Youth' },
  { name: 'Georgia Youth Play Collective', cause: 'Youth' },
  { name: 'Ready Together Georgia', cause: 'Disaster Relief' },
  { name: 'Community Response Circle', cause: 'Disaster Relief' },
  { name: 'Safe Harbor Supply Network', cause: 'Disaster Relief' },
  { name: 'Georgia Recovery Neighbors', cause: 'Disaster Relief' },
  { name: 'Westside Garden Neighbors', cause: 'Community' },
  { name: 'Georgia Neighbors Network', cause: 'Community' },
  { name: 'Block by Block Circle', cause: 'Community' },
  { name: 'Common Porch Collective', cause: 'Community' },
  { name: 'Homefront Welcome Project', cause: 'Veterans' },
  { name: 'Georgia Service Family Circle', cause: 'Veterans' },
  { name: 'New Mission Career Network', cause: 'Veterans' },
  { name: 'Veteran Neighbor Exchange', cause: 'Veterans' },
];

const FUNDRAISER_THEMES = {
  Environment: {
    titles: [
      'Neighborhood Cleanup Supply Fund', 'Tools for a Healthier Watershed',
      'Community Tree-Planting Fund', 'Restore a Local Habitat',
      'Keep Our Green Spaces Growing', 'Fall Creek Care Campaign',
    ],
    userStory: 'I am bringing neighbors together to fund practical supplies for a hands-on environmental project. Every contribution helps the team arrive prepared and leave a healthier shared space behind.',
    organizationStory: 'This campaign will equip local crews with the practical tools and materials needed for the next season of restoration work.',
  },
  'Food & Hunger': {
    titles: [
      'Meal Boxes for Local Families', 'Stock the Community Pantry',
      'Fresh Grocery Support Fund', 'Community Kitchen Supply Drive',
      'Weekend Meals for Neighbors', 'Fill the Pantry Shelves',
    ],
    userStory: 'I am raising funds for meal supplies that can reach families through a trusted community partner. The goal is specific, local, and something our neighbors can accomplish together.',
    organizationStory: 'This campaign supports the purchase and packing of dependable meal and pantry supplies for upcoming community distributions.',
  },
  Animals: {
    titles: [
      'Foster Care Supply Fund', 'Shelter Medical Care Campaign',
      'Adoption Day Resource Fund', 'Enrichment Kits for Shelter Pets',
      'Care Packages for Foster Families', 'Help Local Pets Get Home',
    ],
    userStory: 'I am helping a local animal-care team cover useful supplies for pets and foster families. Small contributions add up quickly when the need is concrete.',
    organizationStory: 'This campaign funds veterinary, foster, and enrichment resources that help animals receive consistent care while they wait for permanent homes.',
  },
  Education: {
    titles: [
      'Books for Community Learners', 'STEM Kits for Young Makers',
      'Tutoring Supply Fund', 'Student Project Materials',
      'Build the Next Learning Library', 'Back-to-School Learning Fund',
    ],
    userStory: 'I am rallying friends around a practical education goal: putting useful learning materials directly into students’ hands through a local program.',
    organizationStory: 'This campaign will provide books, learning kits, and program materials for upcoming student sessions.',
  },
  Health: {
    titles: [
      'Community Wellness Kit Fund', 'Neighborhood Care Resource Drive',
      'Accessible Health Guide Fund', 'Wellness Outreach Supplies',
      'Family Care Kit Campaign', 'Local Wellness Resource Fund',
    ],
    userStory: 'I am raising funds for clear, practical wellness resources that community outreach teams can share with neighbors.',
    organizationStory: 'This campaign supports wellness kits and accessible resource materials for community outreach events.',
  },
  Housing: {
    titles: [
      'Welcome Home Kit Fund', 'Home Repair Material Campaign',
      'Household Essentials for Move-In Day', 'Stable Start Supply Fund',
      'Rooms Ready for New Beginnings', 'Neighbor-to-Neighbor Housing Fund',
    ],
    userStory: 'I am helping gather the practical household items and repair materials that make a move into stable housing feel like a real beginning.',
    organizationStory: 'This campaign funds home-repair materials and move-in essentials for neighbors transitioning into stable housing.',
  },
  Youth: {
    titles: [
      'Mentoring Materials for Young Leaders', 'Youth Recreation Supply Fund',
      'School Supplies for Growing Minds', 'After-School Program Campaign',
      'Creative Kits for Youth Workshops', 'Community Youth Day Fund',
    ],
    userStory: 'I am raising funds for the supplies that help youth programs feel welcoming, creative, and ready for every participant.',
    organizationStory: 'This campaign equips upcoming youth and mentoring programs with learning, recreation, and workshop materials.',
  },
  'Disaster Relief': {
    titles: [
      'Emergency Kit Supply Fund', 'Storm Recovery Resource Campaign',
      'Preparedness Kits for Neighbors', 'Community Recovery Supply Drive',
      'Ready Together Relief Fund', 'Rapid Response Materials Fund',
    ],
    userStory: 'I am helping a community response team keep practical emergency supplies ready before they are urgently needed.',
    organizationStory: 'This campaign replenishes emergency kits and recovery supplies used by trained community response partners.',
  },
  Community: {
    titles: [
      'Neighborhood Project Supply Fund', 'Community Garden Improvement Fund',
      'Shared Space Refresh Campaign', 'Block-by-Block Project Fund',
      'A Better Gathering Place', 'Neighbors Building Together',
    ],
    userStory: 'I am inviting neighbors to help fund a visible, practical improvement to a shared community space. It is a small project with a result we can all see.',
    organizationStory: 'This campaign provides materials for resident-led neighborhood projects and improvements to shared community spaces.',
  },
  Veterans: {
    titles: [
      'Veterans Resource Day Fund', 'Welcome Kits for Military Families',
      'Career Support Materials for Veterans', 'Community Veterans Gathering Fund',
      'Service Family Resource Campaign', 'Veteran Neighbor Support Fund',
    ],
    userStory: 'I am raising funds for practical resources that help veterans and military families connect with local support in a respectful, welcoming setting.',
    organizationStory: 'This campaign funds resource-day materials, welcome kits, and career-support tools for veterans and military families.',
  },
};

const USER_GOALS = [
  { value: 25000, weight: 3 }, { value: 50000, weight: 12 },
  { value: 75000, weight: 10 }, { value: 100000, weight: 20 },
  { value: 150000, weight: 18 }, { value: 200000, weight: 14 },
  { value: 250000, weight: 12 }, { value: 500000, weight: 3 },
];

const ORGANIZATION_GOALS = [
  { value: 100000, weight: 5 }, { value: 250000, weight: 18 },
  { value: 500000, weight: 24 }, { value: 750000, weight: 18 },
  { value: 1000000, weight: 15 }, { value: 1500000, weight: 7 },
  { value: 2000000, weight: 3 },
];

const SUPPORT_AMOUNTS = [
  { value: 500, weight: 2 }, { value: 1000, weight: 4 },
  { value: 1500, weight: 5 }, { value: 2000, weight: 6 },
  { value: 2500, weight: 20 }, { value: 5000, weight: 24 },
  { value: 7500, weight: 7 }, { value: 10000, weight: 19 },
  { value: 15000, weight: 5 }, { value: 25000, weight: 3 },
  { value: 50000, weight: 1 },
];

const ANCHOR_FUNDRAISERS = [
  {
    key: 'maya-meal-boxes', title: '100 Meal Boxes for Atlanta Families',
    creatorUser: 'Maya Ellis', cause: 'Food & Hunger',
    beneficiaryOrganization: 'Mosaic Meals Collective', goalAmountCents: 100000,
    createdDayOffset: -24, endDayOffset: 38, status: 'active',
    story: 'I have seen how quickly a well-packed meal box can make a busy week easier for a family. I am teaming up with Mosaic Meals Collective to fund 100 boxes for Atlanta neighbors this fall.',
    imageUrl: '/demo-assets/fundraisers/anchors/maya-meal-boxes.jpg',
    supportAmounts: [5000, 10000, 5000, 7500, 10000, 5000, 7500, 5000, 5000, 5000],
    requiredSupporter: 'David Mercer', requiredAmountCents: 5000,
  },
  {
    key: 'david-veterans-resource-day', title: 'Roswell Veterans Resource Day Fund',
    creatorUser: 'David Mercer', cause: 'Veterans',
    beneficiaryOrganization: 'Northstar Veterans Network', goalAmountCents: 250000,
    createdDayOffset: -39, endDayOffset: 52, status: 'active',
    story: 'Resource Day works best when every table is ready and every family can leave with useful next steps. I am raising funds with Northstar Veterans Network for materials, welcome kits, and local resource guides.',
    imageUrl: '/demo-assets/fundraisers/anchors/david-veterans-resource-day.jpg',
    supportAmounts: [5000, 5000, 5000, 10000, 10000, 10000, 10000, 10000, 10000, 15000, 15000, 15000, 15000, 25000, 25000],
    requiredSupporter: 'Maya Ellis', requiredAmountCents: 5000,
  },
  {
    key: 'riverlight-waterways', title: "Keep Atlanta's Waterways Clean This Fall",
    creatorOrganization: 'Riverlight Atlanta', cause: 'Environment',
    beneficiaryOrganization: 'Riverlight Atlanta', goalAmountCents: 500000,
    createdDayOffset: -53, endDayOffset: 67, status: 'active',
    story: 'Help equip Riverlight crews with cleanup tools, water-testing supplies, and native planting materials for a full season of community waterway projects.',
    imageUrl: '/demo-assets/fundraisers/anchors/riverlight-waterways.jpg',
    supportAmounts: [5000, 5000, 5000, 5000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 50000, 50000],
  },
  {
    key: 'mosaic-summer-meals', title: 'Summer Meal Box Fund',
    creatorOrganization: 'Mosaic Meals Collective', cause: 'Food & Hunger',
    beneficiaryOrganization: 'Mosaic Meals Collective', goalAmountCents: 250000,
    createdDayOffset: -112, endDayOffset: -18, status: 'active',
    story: 'Mosaic Meals Collective raised support for shelf-stable meal boxes and fresh grocery add-ons during the busiest weeks of summer distribution.',
    imageUrl: '/demo-assets/fundraisers/anchors/mosaic-summer-meals.jpg',
    supportAmounts: [5000, 5000, 5000, 5000, 5000, 10000, 10000, 10000, 10000, 10000, 15000, 15000, 15000, 15000, 15000, 25000, 25000, 25000, 25000, 25000],
  },
];

module.exports = {
  EXTERNAL_FUNDRAISER_BENEFICIARIES,
  FUNDRAISER_THEMES,
  USER_GOALS,
  ORGANIZATION_GOALS,
  SUPPORT_AMOUNTS,
  ANCHOR_FUNDRAISERS,
};
