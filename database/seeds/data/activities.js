const EXTERNAL_ACTIVITY_ORGANIZATIONS = [
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

const MANUAL_ACTIVITY_TITLES = {
  Environment: [
    'Neighborhood Creek Cleanup', 'Community Garden Care Morning',
    'Tree Canopy Volunteer Shift', 'Trail Restoration Workday',
  ],
  'Food & Hunger': [
    'Community Pantry Packing', 'Neighborhood Meal Prep Shift',
    'Fresh Food Distribution', 'Weekend Grocery Sorting',
  ],
  Animals: [
    'Foster Supply Sorting', 'Shelter Dog Walking Shift',
    'Animal Care Kit Assembly', 'Adoption Profile Writing',
  ],
  Education: [
    'Community Tutoring Session', 'Learning Material Prep',
    'Family Reading Workshop', 'Student Project Support',
  ],
  Health: [
    'Wellness Resource Packing', 'Community Health Fair Support',
    'Care Guide Review', 'Neighborhood Wellness Outreach',
  ],
  Housing: [
    'Home Repair Volunteer Day', 'Welcome Kit Assembly',
    'Housing Resource Update', 'Move-In Support Shift',
  ],
  Youth: [
    'Youth Mentoring Session', 'Community Recreation Support',
    'Teen Workshop Volunteer Shift', 'After-School Activity Team',
  ],
  'Disaster Relief': [
    'Emergency Kit Packing', 'Recovery Supply Sorting',
    'Preparedness Resource Shift', 'Community Response Training Support',
  ],
  Community: [
    'Westside Community Garden Morning', 'Neighborhood Welcome Day',
    'Community Resource Fair Shift', 'Block Cleanup Project',
  ],
  Veterans: [
    'Veteran Welcome Kit Assembly', 'Military Family Resource Shift',
    'Career Workshop Support', 'Community Veterans Gathering',
  ],
};

const ACTIVITY_STORIES = {
  Environment: [
    'Spent the morning clearing litter along the trail and helping reset a few overgrown sections.',
    'Worked with a small crew to care for the green space and leave the paths in much better shape.',
    'Helped sort collected material and prepare the site for the next community workday.',
  ],
  'Food & Hunger': [
    'Packed meal boxes with a great crew and helped organize the final pickup tables.',
    'Sorted pantry staples, assembled grocery bags, and helped keep the distribution line moving.',
    'Prepared meal supplies and finished the shift by resetting stations for the next volunteer team.',
  ],
  Animals: [
    'Spent the shift walking dogs and preparing enrichment supplies for the foster team.',
    'Sorted donated pet supplies and assembled care kits for animals moving into foster homes.',
    'Helped turn caregiver notes into friendly profiles for animals waiting to meet new families.',
  ],
  Education: [
    'Worked with students on assignments and helped them prepare for next week’s project.',
    'Set up learning materials and supported students as they worked through the activity stations.',
    'Shared a focused tutoring session and left the next set of practice materials ready to go.',
  ],
  Health: [
    'Packed wellness resources and helped make the information tables easier for families to navigate.',
    'Supported check-in, restocked materials, and guided neighbors toward the right resource stations.',
    'Reviewed community care information and flagged several details for the program team to update.',
  ],
  Housing: [
    'Helped with light repairs and cleanup so the home was ready for its next chapter.',
    'Assembled welcome supplies and organized household essentials for an upcoming move-in.',
    'Updated housing resource information and prepared a cleaner guide for community distribution.',
  ],
  Youth: [
    'Helped lead activity stations and made sure every young person had a chance to participate.',
    'Spent the afternoon supporting mentors and preparing materials for the next youth workshop.',
    'Joined a small-group session focused on confidence, teamwork, and practical next steps.',
  ],
  'Disaster Relief': [
    'Packed emergency supplies, checked kit lists, and organized completed cases for distribution.',
    'Sorted recovery materials and helped the team prepare a clear inventory for rapid response.',
    'Supported a preparedness session and reset supplies for the next neighborhood group.',
  ],
  Community: [
    'Worked alongside neighbors to refresh a shared space and prepare it for the next gathering.',
    'Helped welcome residents, organize resource tables, and connect people with local programs.',
    'Spent a few hours on practical neighborhood work with a crew that made the day feel easy.',
  ],
  Veterans: [
    'Assembled welcome kits and organized resource materials for veterans and military families.',
    'Supported the resource tables and helped attendees find the right community partners.',
    'Prepared career materials and helped the workshop team keep each session running smoothly.',
  ],
};

module.exports = {
  EXTERNAL_ACTIVITY_ORGANIZATIONS,
  MANUAL_ACTIVITY_TITLES,
  ACTIVITY_STORIES,
};
