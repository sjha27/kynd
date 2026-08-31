const COMMENT_TEMPLATES = Object.freeze({
  activity_co_participant: [
    'Great volunteering alongside you on {title}.',
    'I was glad to be part of {title} with you.',
    'Such a good crew for {title} — grateful we showed up together.',
    'Really enjoyed working together on {title}.',
  ],
  activity_follower: [
    'Always glad to see you showing up for {cause}.',
    'This is such a thoughtful way to support {cause}.',
    'Your community work keeps inspiring me.',
    'A meaningful contribution — thanks for sharing it.',
  ],
  activity_manual: [
    'Love that you made time for this community project.',
    'A great reminder that small local efforts matter.',
    'This kind of hands-on help makes a real difference.',
    'So good to see outside volunteering become part of your Kynd story.',
  ],
  activity_cause_aligned: [
    '{cause} work like this is always worth celebrating.',
    'This is the kind of practical {cause} effort I love seeing.',
    'Such a strong example of neighbors supporting {cause}.',
    'Meaningful work for a cause close to my heart.',
  ],
  activity_encouragement: [
    'A morning well spent — thanks for sharing this.',
    'This looks like such a worthwhile day.',
    'Community effort at its best.',
    'Glad this work and the people behind it are getting seen.',
  ],

  opportunity_joined: [
    'I am joining {title} too — looking forward to helping.',
    'Looking forward to being there for {title}.',
    'Glad I signed up for {title} — see everyone there.',
    'Counted in for {title} and ready to help.',
  ],
  opportunity_saved: [
    'Saved {title} so I can come back to the details.',
    'This one is saved — such a useful way to support {cause}.',
    'Keeping {title} on my list for the weeks ahead.',
    'Saved this opportunity; the format looks really approachable.',
  ],
  opportunity_host_follower: [
    '{host} always creates thoughtful ways to get involved.',
    'Another practical opportunity from {host}.',
    'Glad to see {host} bringing people together for this.',
    'This looks like a strong community project from {host}.',
  ],
  opportunity_attendee_social: [
    'Great to see people in my community already showing up for this.',
    'The early community interest makes this one especially encouraging.',
    'Love seeing familiar people rally around {cause}.',
    'This already feels like a strong community effort.',
  ],
  opportunity_cause_aligned: [
    'A clear, practical way to support {cause}.',
    'This is exactly the kind of {cause} opportunity Atlanta needs.',
    'The commitment feels manageable and the cause matters.',
    'Really glad this {cause} opportunity is available.',
  ],

  fundraiser_supporter: [
    'Glad to contribute to such a clear, practical goal.',
    'Happy to help move this campaign forward.',
    'I chipped in and am cheering this team on.',
    'Proud to support this work for {beneficiary}.',
  ],
  fundraiser_creator_follower: [
    'Always glad to see {creator} turn care into a concrete goal.',
    'Cheering on {creator} and everyone supporting this campaign.',
    'This is a thoughtful campaign from {creator}.',
    'A practical goal from someone I trust in the community.',
  ],
  fundraiser_beneficiary_follower: [
    'Glad to see the community rallying around {beneficiary}.',
    '{beneficiary} does meaningful work — cheering this campaign on.',
    'A strong way to help {beneficiary} keep serving neighbors.',
    'This support can go a long way for {beneficiary}.',
  ],
  fundraiser_cause_aligned: [
    'A concrete {cause} goal that is easy to rally behind.',
    'Cheering for everyone moving this {cause} campaign forward.',
    'This is a meaningful way to support {cause}.',
    'Glad this community need has such a clear goal.',
  ],
  fundraiser_ended_success: [
    'Amazing to see this campaign reach its goal — worth celebrating.',
    'What a result for {beneficiary}; congratulations to everyone involved.',
    'The community came through — a wonderful campaign to celebrate.',
    'So good to see this goal met and the momentum carry through.',
  ],
  fundraiser_encouragement: [
    'Cheering this campaign on as it builds momentum.',
    'A clear goal and a community worth supporting.',
    'Glad to see this need getting thoughtful attention.',
    'Every bit of visibility helps a practical campaign like this.',
  ],
});

const ANCHOR_COMMENTS = Object.freeze({
  mayaActivityByDavid: 'Love seeing this, Maya — such a good way to spend a morning.',
  davidActivityByMaya: 'Such a practical way to show up for veterans and their families.',
  flagshipByMaya: 'Looking forward to this one — see you there.',
  mayaFundraiserByDavid: 'Happy to chip in — this is such a practical goal.',
  davidFundraiserByMaya: 'Glad to support this — such a useful resource for local families.',
});

function templateMatches(template, body) {
  const pattern = template.split(/\{\w+\}/).map((part) => (
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )).join('.+?');
  return new RegExp(`^${pattern}$`).test(body);
}

function classifyCommentBody(body, targetType = null) {
  for (const [category, templates] of Object.entries(COMMENT_TEMPLATES)) {
    if (targetType && !category.startsWith(`${targetType}_`)) continue;
    if (templates.some((template) => templateMatches(template, body))) return category;
  }
  if (body === ANCHOR_COMMENTS.flagshipByMaya) return 'opportunity_joined';
  if ([
    ANCHOR_COMMENTS.mayaFundraiserByDavid,
    ANCHOR_COMMENTS.davidFundraiserByMaya,
  ].includes(body)) return 'fundraiser_supporter';
  if (body === ANCHOR_COMMENTS.mayaActivityByDavid) return 'activity_follower';
  if (body === ANCHOR_COMMENTS.davidActivityByMaya) return 'activity_cause_aligned';
  return null;
}

module.exports = { COMMENT_TEMPLATES, ANCHOR_COMMENTS, classifyCommentBody };
