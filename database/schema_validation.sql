BEGIN;

-- ------------------------------------------------------------
-- Seed minimal valid records for constraint testing
-- ------------------------------------------------------------

INSERT INTO users (
    id, display_name, city, state
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Test User One',
    'Atlanta',
    'GA'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Test User Two',
    'Atlanta',
    'GA'
);

INSERT INTO causes (
    id, name, sort_order
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'Test Cause',
    1
);

INSERT INTO organizations (
    id,
    name,
    mission,
    city,
    state
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    'Test Organization',
    'Temporary organization for schema validation.',
    'Atlanta',
    'GA'
);

INSERT INTO opportunities (
    id,
    title,
    opportunity_type,
    cause_id,
    host_organization_id,
    description,
    starts_at,
    ends_at,
    is_online,
    location_name,
    city,
    state,
    capacity
) VALUES
(
    '30000000-0000-0000-0000-000000000001',
    'Test Volunteer Event',
    'volunteer',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Temporary opportunity for schema validation.',
    now() + interval '1 day',
    now() + interval '2 days',
    false,
    'Test Location',
    'Atlanta',
    'GA',
    10
);

INSERT INTO registrations (
    id,
    user_id,
    opportunity_id,
    status,
    joined_at
) VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'joined',
    now()
);

INSERT INTO fundraisers (
    id,
    title,
    story,
    cause_id,
    creator_user_id,
    beneficiary_name,
    goal_amount_cents,
    end_date
) VALUES
(
    '50000000-0000-0000-0000-000000000001',
    'Test Fundraiser',
    'Temporary fundraiser for schema validation.',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Test Beneficiary',
    10000,
    current_date + 30
);

-- ------------------------------------------------------------
-- Valid operations
-- ------------------------------------------------------------

INSERT INTO user_follows (
    follower_user_id,
    followed_user_id
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
);

INSERT INTO activities (
    id,
    user_id,
    registration_id,
    occurred_on,
    hours
) VALUES
(
    '60000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    current_date,
    2
);

INSERT INTO reactions (
    id,
    user_id,
    reaction_type,
    opportunity_id
) VALUES
(
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'celebrate',
    '30000000-0000-0000-0000-000000000001'
);

ROLLBACK;