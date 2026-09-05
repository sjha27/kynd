'use strict';

const crypto = require('node:crypto');

const fundraisersQueries = require('../db/queries/fundraisers');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');

// Free text goes into unbounded TEXT columns, so it gets product-level bounds
// here. The money ceilings keep an obvious typo out of numbers the product
// displays; they are not a payments rule, because no payment happens.
const MAX_TITLE_LENGTH = 120;
const MAX_STORY_LENGTH = 4000;
const MAX_BENEFICIARY_LENGTH = 120;
const MAX_GOAL_CENTS = 100_000_000; // $1,000,000
const MAX_SUPPORT_CENTS = 1_000_000; // $10,000

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ValidationError(`${label} is required.`);
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function parseCalendarDate(value, label) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value.trim())) {
    throw new ValidationError(`${label} must be a valid date in YYYY-MM-DD format.`);
  }
  const date = value.trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ValidationError(`${label} must be a valid date in YYYY-MM-DD format.`);
  }
  return date;
}

/*
 * Money is integer cents everywhere in the backend and the database. Nothing
 * downstream ever sees a float, so no rounding can quietly change a total.
 */
function parseAmountCents(value, label, maxCents) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new ValidationError(`${label} must be a positive whole number of cents.`);
  }
  if (cents > maxCents) {
    throw new ValidationError(`${label} is larger than this demo accepts.`);
  }
  return cents;
}

function toProductFundraiser(row) {
  const creator = row.creator_user_id
    ? {
        type: 'user',
        id: row.creator_user_id,
        name: row.creator_user_name,
        avatarUrl: row.creator_user_avatar_url,
      }
    : {
        type: 'organization',
        id: row.creator_organization_id,
        name: row.creator_organization_name,
        verified: row.creator_organization_verified,
      };

  const goal = Number(row.goal_amount_cents);
  const raised = Number(row.amount_raised_cents);

  return {
    id: row.id,
    title: row.title,
    story: row.story,
    cause: { id: row.cause_id, name: row.cause_name },
    creator,
    // The beneficiary links to a Kynd organization when one exists;
    // beneficiary_name is always the display snapshot, so an external
    // beneficiary is still named honestly.
    beneficiary: {
      id: row.beneficiary_organization_id,
      name: row.beneficiary_organization_name || row.beneficiary_name,
    },
    goalAmountCents: goal,
    // Derived from support relationships on every read — never stored.
    amountRaisedCents: raised,
    supporterCount: row.supporter_count,
    // Capped at 100 so an over-funded fundraiser doesn't render a bar that
    // overflows its track; the raw amounts above stay exact.
    progressPercent: goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0,
    endDate: row.end_date,
    status: row.status,
    isEnded: row.is_ended,
    // Open to support only while active and before the end date passes.
    canSupport: row.status === 'active' && !row.is_ended && row.viewer_supported !== true,
    viewerSupported: row.viewer_supported === true,
    imageUrl: row.image_url,
  };
}

async function listOpenFundraisers({ limit = 12, sessionId = null } = {}) {
  const rows = await fundraisersQueries.findOpenFundraisers({ limit, sessionId });
  return rows.map(toProductFundraiser);
}

async function getFundraiserDetail(id, sessionId = null) {
  const row = await fundraisersQueries.findFundraiserById(id, sessionId);
  if (!row) throw new NotFoundError('Fundraiser not found');
  return toProductFundraiser(row);
}

/*
 * Simulated support.
 *
 * No payment is processed and no card details are ever collected — the
 * visitor picks an amount and the system records the support relationship.
 * The acting user comes from the resolved session, same rule as Join.
 *
 * Support is one-time, not additive: the schema's
 * UNIQUE (user_id, fundraiser_id) says a person supports a fundraiser once,
 * and that rule is preserved rather than worked around.
 */
async function supportFundraiser({ fundraiserId, userId, sessionId, amountCents }) {
  const amount = parseAmountCents(amountCents, 'Support amount', MAX_SUPPORT_CENTS);

  const fundraiser = await fundraisersQueries.findFundraiserById(fundraiserId, sessionId);
  if (!fundraiser) throw new NotFoundError('Fundraiser not found');

  if (fundraiser.status !== 'active') {
    throw new ConflictError('This fundraiser is no longer accepting support.', 'fundraiser_not_supportable');
  }
  if (fundraiser.is_ended) {
    throw new ConflictError('This fundraiser has ended.', 'fundraiser_ended');
  }

  const inserted = await fundraisersQueries.insertSupport({
    id: crypto.randomUUID(),
    userId,
    fundraiserId,
    amountCents: amount,
  });
  if (!inserted) {
    throw new ConflictError('You have already supported this fundraiser.', 'fundraiser_already_supported');
  }

  // Read back through the ordinary session-aware path, so the caller gets
  // the same derived progress every other surface computes.
  return getFundraiserDetail(fundraiserId, sessionId);
}

/*
 * Starting a fundraiser.
 *
 * The creator is ALWAYS the resolved session's temporary user —
 * creator_user_id is never read from the request, the same rule Creation
 * uses for host_user_id.
 */
async function createFundraiser({ creatorUserId, sessionId, ...input }) {
  const title = requiredText(input.title, 'Title', MAX_TITLE_LENGTH);
  const story = requiredText(input.story, 'Story', MAX_STORY_LENGTH);
  const beneficiaryName = requiredText(
    input.beneficiaryName,
    'Beneficiary',
    MAX_BENEFICIARY_LENGTH
  );
  const causeName = requiredText(input.causeName, 'Cause', MAX_TITLE_LENGTH);
  const goalAmountCents = parseAmountCents(input.goalAmountCents, 'Goal', MAX_GOAL_CENTS);
  const endDate = parseCalendarDate(input.endDate, 'End date');

  const resolved = await fundraisersQueries.resolveFundraiserInputs({
    causeName,
    beneficiaryName,
    endDate,
  });

  if (!resolved.cause_id) {
    throw new ValidationError('Cause must be one of the causes on Kynd.');
  }
  if (resolved.ends_today_or_earlier) {
    throw new ValidationError('End date must be in the future.');
  }

  const id = crypto.randomUUID();
  await fundraisersQueries.insertFundraiser({
    id,
    creatorUserId,
    title,
    story,
    causeId: resolved.cause_id,
    // Linked when the typed beneficiary matched a Kynd organization; the
    // stored name is then that organization's canonical one.
    beneficiaryOrganizationId: resolved.beneficiary_organization_id || null,
    beneficiaryName: resolved.beneficiary_organization_name || beneficiaryName,
    goalAmountCents,
    endDate,
  });

  return getFundraiserDetail(id, sessionId);
}

module.exports = {
  listOpenFundraisers,
  getFundraiserDetail,
  supportFundraiser,
  createFundraiser,
};
