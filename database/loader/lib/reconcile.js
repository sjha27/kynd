const { ALL_KYND_TABLES, TABLE_MAPPINGS } = require('./table_mappings');

function countUnion(comment) {
  return `/* ${comment} */\n${ALL_KYND_TABLES.map((table) => (
    `SELECT '${table}' AS table_name, COUNT(*)::text AS row_count FROM ${table}`
  )).join('\nUNION ALL\n')}`;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid database count for ${label}.`);
  return parsed;
}

function expectedTableCounts(world) {
  const counts = { demo_sessions: 0 };
  for (const mapping of TABLE_MAPPINGS) counts[mapping.table] = world[mapping.collection].length;
  return counts;
}

async function reconcileLoadedWorld(client, world) {
  const expectedCounts = expectedTableCounts(world);
  const countsResult = await client.query(countUnion('kynd:reconcile-table-counts'));
  const actualCounts = Object.fromEntries(
    countsResult.rows.map((row) => [row.table_name, integer(row.row_count, row.table_name)])
  );
  for (const table of ALL_KYND_TABLES) {
    if (actualCounts[table] !== expectedCounts[table]) {
      throw new Error(
        `Reconciliation failed for ${table}: found ${actualCounts[table] ?? 'missing'}, `
        + `expected ${expectedCounts[table]}.`
      );
    }
  }

  const registrationResult = await client.query(`
    /* kynd:reconcile-registration-state */
    SELECT status, COUNT(*)::text AS row_count
    FROM registrations
    GROUP BY status
  `);
  const registrationCounts = Object.fromEntries(
    registrationResult.rows.map((row) => [row.status, integer(row.row_count, row.status)])
  );
  if (registrationCounts.joined !== 6250 || registrationCounts.cancelled !== 750) {
    throw new Error('Reconciliation failed for registration status counts.');
  }

  const capacityResult = await client.query(`
    /* kynd:reconcile-capacity */
    SELECT COUNT(*)::text AS violation_count
    FROM (
      SELECT o.id
      FROM opportunities o
      LEFT JOIN registrations r
        ON r.opportunity_id = o.id AND r.status = 'joined'
      GROUP BY o.id, o.capacity
      HAVING COUNT(r.id) > o.capacity
    ) violations
  `);
  const capacityViolations = integer(capacityResult.rows[0].violation_count, 'capacity violations');
  if (capacityViolations !== 0) throw new Error('Reconciliation found Opportunity capacity violations.');

  const activityResult = await client.query(`
    /* kynd:reconcile-activity-source */
    SELECT
      COUNT(*) FILTER (WHERE registration_id IS NOT NULL)::text AS kynd_count,
      COUNT(*) FILTER (WHERE registration_id IS NULL)::text AS manual_count
    FROM activities
  `);
  const kyndActivities = integer(activityResult.rows[0].kynd_count, 'Kynd Activities');
  const manualActivities = integer(activityResult.rows[0].manual_count, 'manual Activities');
  if (kyndActivities !== 2100 || manualActivities !== 400) {
    throw new Error('Reconciliation failed for Activity source split.');
  }

  const expectedSupportCents = world.fundraiserSupports.reduce(
    (sum, support) => sum + support.amountCents,
    0
  );
  const fundraisingResult = await client.query(`
    /* kynd:reconcile-fundraising */
    SELECT COUNT(*)::text AS support_count,
           COALESCE(SUM(amount_cents), 0)::text AS total_amount_cents
    FROM fundraiser_supports
  `);
  const supportCount = integer(fundraisingResult.rows[0].support_count, 'Fundraiser supports');
  const supportCents = integer(
    fundraisingResult.rows[0].total_amount_cents,
    'Fundraiser support cents'
  );
  if (supportCount !== world.fundraiserSupports.length || supportCents !== expectedSupportCents) {
    throw new Error('Reconciliation failed for Fundraiser support totals.');
  }

  const socialFinancialResult = await client.query(`
    /* kynd:reconcile-social-financial-separation */
    SELECT COUNT(*)::text AS violation_count
    FROM reactions
    WHERE fundraiser_id IS NOT NULL AND reaction_type = 'support'
  `);
  const socialFinancialViolations = integer(
    socialFinancialResult.rows[0].violation_count,
    'social financial violations'
  );
  if (socialFinancialViolations !== 0) {
    throw new Error('Reconciliation found fundraiser-target Support reactions.');
  }

  const flagship = world.opportunities.find((opportunity) => opportunity.flagship === true);
  if (!flagship) throw new Error('Reconciliation could not identify the exact flagship Opportunity.');
  const flagshipResult = await client.query({
    text: `
      /* kynd:reconcile-flagship */
      SELECT o.capacity::text,
             COUNT(r.id) FILTER (WHERE r.status = 'joined')::text AS joined_count
      FROM opportunities o
      LEFT JOIN registrations r ON r.opportunity_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, o.capacity
    `,
    values: [flagship.id],
  });
  if (flagshipResult.rows.length !== 1) throw new Error('Reconciliation did not find the flagship.');
  const flagshipCapacity = integer(flagshipResult.rows[0].capacity, 'flagship capacity');
  const flagshipJoined = integer(flagshipResult.rows[0].joined_count, 'flagship joined count');
  const flagshipAvailable = flagshipCapacity - flagshipJoined;
  if (flagshipJoined !== 5 || flagshipAvailable !== 20) {
    throw new Error('Reconciliation failed for flagship participation.');
  }

  const mediaResult = await client.query(`
    /* kynd:reconcile-controlled-media */
    SELECT
      (SELECT COUNT(*) FROM users WHERE avatar_url IS NOT NULL)::text AS avatar_count,
      (SELECT COUNT(*) FROM organizations WHERE logo_url IS NOT NULL)::text AS logo_count
  `);
  const avatarCount = integer(mediaResult.rows[0].avatar_count, 'avatar references');
  const logoCount = integer(mediaResult.rows[0].logo_count, 'organization logo references');
  if (avatarCount !== 50 || logoCount !== 25) {
    throw new Error('Reconciliation failed for controlled media counts.');
  }

  return {
    tableCounts: actualCounts,
    registrationState: registrationCounts,
    capacityViolations,
    activitySources: { kynd: kyndActivities, manual: manualActivities },
    fundraising: { supports: supportCount, totalAmountCents: supportCents },
    fundraiserSupportReactionViolations: socialFinancialViolations,
    flagship: {
      id: flagship.id,
      joined: flagshipJoined,
      capacity: flagshipCapacity,
      available: flagshipAvailable,
    },
    controlledMedia: { avatars: avatarCount, organizationLogos: logoCount },
  };
}

module.exports = { countUnion, expectedTableCounts, reconcileLoadedWorld };
