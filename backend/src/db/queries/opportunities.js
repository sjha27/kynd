'use strict';

const { query } = require('../pool');

const OPPORTUNITY_SELECT = `
  SELECT
    o.id,
    o.title,
    o.opportunity_type,
    o.status,
    o.description,
    o.what_youll_do,
    o.requirements,
    o.starts_at,
    o.ends_at,
    o.is_online,
    o.location_name,
    o.city,
    o.state,
    o.capacity,
    o.image_url,
    c.id AS cause_id,
    c.name AS cause_name,
    hu.id AS host_user_id,
    hu.display_name AS host_user_name,
    hu.avatar_url AS host_user_avatar_url,
    ho.id AS host_organization_id,
    ho.name AS host_organization_name,
    ho.logo_url AS host_organization_logo_url,
    ho.is_verified_demo AS host_organization_verified,
    (
      SELECT COUNT(*)::int
      FROM registrations r
      WHERE r.opportunity_id = o.id AND r.status = 'joined'
    ) AS joined_count
  FROM opportunities o
  JOIN causes c ON c.id = o.cause_id
  LEFT JOIN users hu ON hu.id = o.host_user_id
  LEFT JOIN organizations ho ON ho.id = o.host_organization_id
`;

async function findPublishedOpportunities({ limit, offset }) {
  const { rows } = await query(
    `${OPPORTUNITY_SELECT}
     WHERE o.status = 'published'
     ORDER BY o.starts_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function findOpportunityById(id) {
  const { rows } = await query(`${OPPORTUNITY_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { findPublishedOpportunities, findOpportunityById };
