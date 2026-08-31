-- ============================================================
-- Kynd
-- Initial PostgreSQL Schema
--
-- Migration: 001_create_initial_kynd_schema.sql
--
-- This migration creates the foundational relational schema
-- for the Kynd demo application.
--
-- The entire migration runs inside a transaction so that
-- PostgreSQL either applies the complete schema successfully
-- or rolls the entire migration back.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. DEMO SESSION INFRASTRUCTURE
-- ============================================================

CREATE TABLE demo_sessions (
    id UUID PRIMARY KEY,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_demo_sessions_expiration
        CHECK (expires_at > created_at)
);


-- ============================================================
-- 2. CORE IDENTITY
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY,

    demo_session_id UUID UNIQUE,

    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,

    city TEXT NOT NULL,
    state TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_users_demo_session
        FOREIGN KEY (demo_session_id)
        REFERENCES demo_sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_users_display_name_nonblank
        CHECK (btrim(display_name) <> ''),

    CONSTRAINT chk_users_bio_length
        CHECK (
            bio IS NULL
            OR char_length(bio) <= 280
        ),

    CONSTRAINT chk_users_state_format
        CHECK (state ~ '^[A-Z]{2}$')
);


CREATE TABLE causes (
    id UUID PRIMARY KEY,

    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL UNIQUE,

    CONSTRAINT chk_causes_name_nonblank
        CHECK (btrim(name) <> ''),

    CONSTRAINT chk_causes_sort_order_positive
        CHECK (sort_order > 0)
);


CREATE TABLE organizations (
    id UUID PRIMARY KEY,

    name TEXT NOT NULL,
    mission TEXT NOT NULL,
    logo_url TEXT,

    city TEXT NOT NULL,
    state TEXT NOT NULL,

    is_verified_demo BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_organizations_name_nonblank
        CHECK (btrim(name) <> ''),

    CONSTRAINT chk_organizations_mission_nonblank
        CHECK (btrim(mission) <> ''),

    CONSTRAINT chk_organizations_state_format
        CHECK (state ~ '^[A-Z]{2}$')
);

-- ============================================================
-- 3. CAUSE AFFINITIES + SOCIAL GRAPH
-- ============================================================

CREATE TABLE user_causes (
    user_id UUID NOT NULL,
    cause_id UUID NOT NULL,

    selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_causes
        PRIMARY KEY (user_id, cause_id),

    CONSTRAINT fk_user_causes_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_causes_cause
        FOREIGN KEY (cause_id)
        REFERENCES causes(id)
        ON DELETE RESTRICT
);


CREATE TABLE organization_causes (
    organization_id UUID NOT NULL,
    cause_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_organization_causes
        PRIMARY KEY (organization_id, cause_id),

    CONSTRAINT fk_organization_causes_organization
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_organization_causes_cause
        FOREIGN KEY (cause_id)
        REFERENCES causes(id)
        ON DELETE RESTRICT
);


CREATE TABLE user_follows (
    follower_user_id UUID NOT NULL,
    followed_user_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_follows
        PRIMARY KEY (follower_user_id, followed_user_id),

    CONSTRAINT fk_user_follows_follower
        FOREIGN KEY (follower_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_follows_followed
        FOREIGN KEY (followed_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_user_follows_not_self
        CHECK (follower_user_id <> followed_user_id)
);


CREATE TABLE organization_follows (
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_organization_follows
        PRIMARY KEY (user_id, organization_id),

    CONSTRAINT fk_organization_follows_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_organization_follows_organization
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE
);
-- ============================================================
-- 4. OPPORTUNITIES + PARTICIPATION
-- ============================================================

CREATE TABLE opportunities (
    id UUID PRIMARY KEY,

    title TEXT NOT NULL,
    opportunity_type TEXT NOT NULL,
    cause_id UUID NOT NULL,

    host_user_id UUID,
    host_organization_id UUID,

    description TEXT NOT NULL,
    what_youll_do TEXT,
    requirements TEXT,

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    is_online BOOLEAN NOT NULL,

    location_name TEXT,
    city TEXT,
    state TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    capacity INTEGER NOT NULL,

    image_url TEXT,

    status TEXT NOT NULL DEFAULT 'published',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_opportunities_cause
        FOREIGN KEY (cause_id)
        REFERENCES causes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_opportunities_host_user
        FOREIGN KEY (host_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_opportunities_host_organization
        FOREIGN KEY (host_organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_opportunities_type
        CHECK (
            opportunity_type IN (
                'volunteer',
                'charity_event'
            )
        ),

    CONSTRAINT chk_opportunities_exactly_one_host
        CHECK (
            (host_user_id IS NOT NULL AND host_organization_id IS NULL)
            OR
            (host_user_id IS NULL AND host_organization_id IS NOT NULL)
        ),

    CONSTRAINT chk_opportunities_valid_time_range
        CHECK (ends_at > starts_at),

    CONSTRAINT chk_opportunities_capacity_positive
        CHECK (capacity > 0),

    CONSTRAINT chk_opportunities_status
        CHECK (
            status IN (
                'published',
                'cancelled'
            )
        ),

    CONSTRAINT chk_opportunities_coordinate_pair
        CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR
            (latitude IS NOT NULL AND longitude IS NOT NULL)
        ),

    CONSTRAINT chk_opportunities_latitude_range
        CHECK (
            latitude IS NULL
            OR latitude BETWEEN -90 AND 90
        ),

    CONSTRAINT chk_opportunities_longitude_range
        CHECK (
            longitude IS NULL
            OR longitude BETWEEN -180 AND 180
        ),

    CONSTRAINT chk_opportunities_offline_location
        CHECK (
            is_online
            OR (
                location_name IS NOT NULL
                AND btrim(location_name) <> ''
                AND city IS NOT NULL
                AND btrim(city) <> ''
                AND state IS NOT NULL
            )
        ),

    CONSTRAINT chk_opportunities_state_format
        CHECK (
            state IS NULL
            OR state ~ '^[A-Z]{2}$'
        )
);


CREATE TABLE registrations (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,
    opportunity_id UUID NOT NULL,

    status TEXT NOT NULL DEFAULT 'joined',

    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT uq_registrations_user_opportunity
        UNIQUE (user_id, opportunity_id),

    -- Supports the composite foreign key from activities so the
    -- database can guarantee that an activity belongs to the
    -- same user who owns the referenced registration.
    CONSTRAINT uq_registrations_id_user
        UNIQUE (id, user_id),

    CONSTRAINT fk_registrations_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_registrations_opportunity
        FOREIGN KEY (opportunity_id)
        REFERENCES opportunities(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_registrations_status
        CHECK (
            status IN (
                'joined',
                'cancelled'
            )
        ),

    CONSTRAINT chk_registrations_cancellation_state
        CHECK (
            (status = 'joined' AND cancelled_at IS NULL)
            OR
            (status = 'cancelled' AND cancelled_at IS NOT NULL)
        ),

    CONSTRAINT chk_registrations_cancellation_time
        CHECK (
            cancelled_at IS NULL
            OR cancelled_at >= joined_at
        )
);


CREATE TABLE saved_opportunities (
    user_id UUID NOT NULL,
    opportunity_id UUID NOT NULL,

    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_saved_opportunities
        PRIMARY KEY (user_id, opportunity_id),

    CONSTRAINT fk_saved_opportunities_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_saved_opportunities_opportunity
        FOREIGN KEY (opportunity_id)
        REFERENCES opportunities(id)
        ON DELETE CASCADE
);
-- ============================================================
-- 5. ACTIVITIES + CONTRIBUTION HISTORY
-- ============================================================

CREATE TABLE activities (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    -- Present when the activity originated from a Kynd
    -- opportunity registration. NULL for manually logged
    -- activity completed outside Kynd.
    registration_id UUID UNIQUE,

    occurred_on DATE NOT NULL,
    hours NUMERIC NOT NULL,

    -- These fields are used only for manually logged activity.
    manual_title TEXT,
    manual_cause_id UUID,
    manual_organization_id UUID,
    manual_organization_name TEXT,

    story TEXT,
    image_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_activities_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- The composite relationship guarantees that the user
    -- attached to an activity is the same user who owns the
    -- referenced registration.
    CONSTRAINT fk_activities_registration_user
        FOREIGN KEY (registration_id, user_id)
        REFERENCES registrations(id, user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_activities_manual_cause
        FOREIGN KEY (manual_cause_id)
        REFERENCES causes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_activities_manual_organization
        FOREIGN KEY (manual_organization_id)
        REFERENCES organizations(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_activities_hours_positive
        CHECK (hours > 0),

    CONSTRAINT chk_activities_source_shape
        CHECK (
            (
                registration_id IS NOT NULL
                AND manual_title IS NULL
                AND manual_cause_id IS NULL
                AND manual_organization_id IS NULL
                AND manual_organization_name IS NULL
            )
            OR
            (
                registration_id IS NULL
                AND manual_title IS NOT NULL
                AND btrim(manual_title) <> ''
                AND manual_cause_id IS NOT NULL
                AND manual_organization_name IS NOT NULL
                AND btrim(manual_organization_name) <> ''
            )
        )
);

-- ============================================================
-- 6. FUNDRAISING
-- ============================================================

CREATE TABLE fundraisers (
    id UUID PRIMARY KEY,

    title TEXT NOT NULL,
    story TEXT NOT NULL,

    cause_id UUID NOT NULL,

    creator_user_id UUID,
    creator_organization_id UUID,

    -- beneficiary_organization_id links to a Kynd organization
    -- when one exists. beneficiary_name is always preserved as
    -- the historical/display snapshot.
    beneficiary_organization_id UUID,
    beneficiary_name TEXT NOT NULL,

    goal_amount_cents BIGINT NOT NULL,
    end_date DATE NOT NULL,

    image_url TEXT,

    status TEXT NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_fundraisers_cause
        FOREIGN KEY (cause_id)
        REFERENCES causes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fundraisers_creator_user
        FOREIGN KEY (creator_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_fundraisers_creator_organization
        FOREIGN KEY (creator_organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fundraisers_beneficiary_organization
        FOREIGN KEY (beneficiary_organization_id)
        REFERENCES organizations(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_fundraisers_title_nonblank
        CHECK (btrim(title) <> ''),

    CONSTRAINT chk_fundraisers_story_nonblank
        CHECK (btrim(story) <> ''),

    CONSTRAINT chk_fundraisers_beneficiary_name_nonblank
        CHECK (btrim(beneficiary_name) <> ''),

    CONSTRAINT chk_fundraisers_exactly_one_creator
        CHECK (
            (creator_user_id IS NOT NULL AND creator_organization_id IS NULL)
            OR
            (creator_user_id IS NULL AND creator_organization_id IS NOT NULL)
        ),

    CONSTRAINT chk_fundraisers_goal_positive
        CHECK (goal_amount_cents > 0),

    CONSTRAINT chk_fundraisers_status
        CHECK (
            status IN (
                'active',
                'cancelled'
            )
        ),

    CONSTRAINT chk_fundraisers_end_date
        CHECK (end_date >= created_at::date)
);


CREATE TABLE fundraiser_supports (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,
    fundraiser_id UUID NOT NULL,

    amount_cents BIGINT NOT NULL,

    supported_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fundraiser_supports_user_fundraiser
        UNIQUE (user_id, fundraiser_id),

    CONSTRAINT fk_fundraiser_supports_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_fundraiser_supports_fundraiser
        FOREIGN KEY (fundraiser_id)
        REFERENCES fundraisers(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_fundraiser_supports_amount_positive
        CHECK (amount_cents > 0)
);
-- ============================================================
-- 7. SOCIAL ENGAGEMENT
-- ============================================================

CREATE TABLE reactions (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    reaction_type TEXT NOT NULL,

    activity_id UUID,
    opportunity_id UUID,
    fundraiser_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_reactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reactions_activity
        FOREIGN KEY (activity_id)
        REFERENCES activities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reactions_opportunity
        FOREIGN KEY (opportunity_id)
        REFERENCES opportunities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reactions_fundraiser
        FOREIGN KEY (fundraiser_id)
        REFERENCES fundraisers(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_reactions_type
        CHECK (
            reaction_type IN (
                'like',
                'celebrate',
                'support'
            )
        ),

    CONSTRAINT chk_reactions_exactly_one_target
        CHECK (
            num_nonnulls(
                activity_id,
                opportunity_id,
                fundraiser_id
            ) = 1
        ),

    -- Fundraiser "support" is represented by fundraiser_supports
    -- rather than the generic social reaction system.
    CONSTRAINT chk_reactions_no_support_on_fundraiser
        CHECK (
            fundraiser_id IS NULL
            OR reaction_type <> 'support'
        )
);


CREATE TABLE comments (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    body TEXT NOT NULL,

    activity_id UUID,
    opportunity_id UUID,
    fundraiser_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_activity
        FOREIGN KEY (activity_id)
        REFERENCES activities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_opportunity
        FOREIGN KEY (opportunity_id)
        REFERENCES opportunities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_fundraiser
        FOREIGN KEY (fundraiser_id)
        REFERENCES fundraisers(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_comments_exactly_one_target
        CHECK (
            num_nonnulls(
                activity_id,
                opportunity_id,
                fundraiser_id
            ) = 1
        ),

    CONSTRAINT chk_comments_body_nonblank
        CHECK (btrim(body) <> ''),

    CONSTRAINT chk_comments_body_length
        CHECK (char_length(body) <= 1000)
);
-- ============================================================
-- 8. INDEXES
-- ============================================================

-- ------------------------------------------------------------
-- Demo session cleanup
-- ------------------------------------------------------------

CREATE INDEX idx_demo_sessions_expires_at
    ON demo_sessions (expires_at);


-- ------------------------------------------------------------
-- User + organization location discovery
-- ------------------------------------------------------------

CREATE INDEX idx_users_city_state
    ON users (city, state);

CREATE INDEX idx_organizations_city_state
    ON organizations (city, state);


-- ------------------------------------------------------------
-- Cause reverse lookups
-- ------------------------------------------------------------

CREATE INDEX idx_user_causes_cause_id
    ON user_causes (cause_id);

CREATE INDEX idx_organization_causes_cause_id
    ON organization_causes (cause_id);


-- ------------------------------------------------------------
-- Social graph reverse lookups
--
-- The primary keys already efficiently answer:
-- "Who does this user follow?"
--
-- These indexes efficiently answer the reverse:
-- "Who follows this user/organization?"
-- ------------------------------------------------------------

CREATE INDEX idx_user_follows_followed_user
    ON user_follows (followed_user_id, created_at DESC);

CREATE INDEX idx_organization_follows_organization
    ON organization_follows (organization_id, created_at DESC);


-- ------------------------------------------------------------
-- Opportunity discovery + feed retrieval
-- ------------------------------------------------------------

CREATE INDEX idx_opportunities_cause_starts_at
    ON opportunities (cause_id, starts_at);

CREATE INDEX idx_opportunities_status_starts_at
    ON opportunities (status, starts_at);

CREATE INDEX idx_opportunities_city_state_starts_at
    ON opportunities (city, state, starts_at);

CREATE INDEX idx_opportunities_host_user_created_at
    ON opportunities (host_user_id, created_at DESC)
    WHERE host_user_id IS NOT NULL;

CREATE INDEX idx_opportunities_host_organization_created_at
    ON opportunities (host_organization_id, created_at DESC)
    WHERE host_organization_id IS NOT NULL;


-- ------------------------------------------------------------
-- Registration lookups
-- ------------------------------------------------------------

CREATE INDEX idx_registrations_user_status_joined_at
    ON registrations (user_id, status, joined_at DESC);

CREATE INDEX idx_registrations_opportunity_status
    ON registrations (opportunity_id, status);


-- ------------------------------------------------------------
-- Saved opportunity reverse lookup
-- ------------------------------------------------------------

CREATE INDEX idx_saved_opportunities_opportunity
    ON saved_opportunities (opportunity_id);


-- ------------------------------------------------------------
-- Activity history + feed retrieval
-- ------------------------------------------------------------

CREATE INDEX idx_activities_user_occurred_on
    ON activities (user_id, occurred_on DESC);

CREATE INDEX idx_activities_user_created_at
    ON activities (user_id, created_at DESC);

CREATE INDEX idx_activities_manual_cause
    ON activities (manual_cause_id)
    WHERE manual_cause_id IS NOT NULL;


-- ------------------------------------------------------------
-- Fundraiser discovery + creator feeds
-- ------------------------------------------------------------

CREATE INDEX idx_fundraisers_cause_end_date
    ON fundraisers (cause_id, end_date);

CREATE INDEX idx_fundraisers_status_end_date
    ON fundraisers (status, end_date);

CREATE INDEX idx_fundraisers_creator_user_created_at
    ON fundraisers (creator_user_id, created_at DESC)
    WHERE creator_user_id IS NOT NULL;

CREATE INDEX idx_fundraisers_creator_organization_created_at
    ON fundraisers (creator_organization_id, created_at DESC)
    WHERE creator_organization_id IS NOT NULL;


-- ------------------------------------------------------------
-- Fundraiser progress + user support history
-- ------------------------------------------------------------

CREATE INDEX idx_fundraiser_supports_fundraiser_supported_at
    ON fundraiser_supports (fundraiser_id, supported_at DESC);

CREATE INDEX idx_fundraiser_supports_user_supported_at
    ON fundraiser_supports (user_id, supported_at DESC);


-- ------------------------------------------------------------
-- Reaction uniqueness + target lookups
--
-- Each user can have at most one reaction on each target.
-- Changing a reaction updates the existing row rather than
-- inserting another reaction.
--
-- These partial unique indexes also efficiently support
-- reaction counts and lookups for each content type.
-- ------------------------------------------------------------

CREATE UNIQUE INDEX uq_reactions_activity_user
    ON reactions (activity_id, user_id)
    WHERE activity_id IS NOT NULL;

CREATE UNIQUE INDEX uq_reactions_opportunity_user
    ON reactions (opportunity_id, user_id)
    WHERE opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX uq_reactions_fundraiser_user
    ON reactions (fundraiser_id, user_id)
    WHERE fundraiser_id IS NOT NULL;

CREATE INDEX idx_reactions_user_created_at
    ON reactions (user_id, created_at DESC);


-- ------------------------------------------------------------
-- Comment retrieval
-- ------------------------------------------------------------

CREATE INDEX idx_comments_activity_created_at
    ON comments (activity_id, created_at DESC)
    WHERE activity_id IS NOT NULL;

CREATE INDEX idx_comments_opportunity_created_at
    ON comments (opportunity_id, created_at DESC)
    WHERE opportunity_id IS NOT NULL;

CREATE INDEX idx_comments_fundraiser_created_at
    ON comments (fundraiser_id, created_at DESC)
    WHERE fundraiser_id IS NOT NULL;


-- ============================================================
-- END MIGRATION
-- ============================================================

COMMIT;