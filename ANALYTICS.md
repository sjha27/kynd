# Kynd analytics

How Kynd measures itself, and — just as importantly — what those numbers can
and cannot be used to claim.

## Architecture

Structured events written by the backend as **single-line JSON on stdout**,
captured by Render's log stream.

No analytics SDK, no vendor, no pixel, no cookie, no `analytics_events`
table, no migration, no change to the frozen 16-table product schema. The
whole implementation is one module (`backend/src/lib/analytics.js`), a set of
call sites in existing routes, and a narrow endpoint for the few events only
the browser can report.

Two properties matter more than anything else here:

1. **Instrumentation cannot affect the product.** Every emit is wrapped so a
   failure — a serialization bug, a broken log transport — is swallowed. A
   test asserts that a Save still succeeds and still writes its row while
   `console.log` is throwing.
2. **Visitor free text never leaves the database.** Not comments, stories,
   titles, descriptions, typed organization names, or search terms. Only
   *shapes* of them (`has_story`, `has_query`) and bounded buckets.

### Why backend-first

Every event that matters is already a server operation with a resolved
session. Emitting there means the event is a *fact* rather than a client
claim, it cannot be blocked by an ad blocker or a content blocker, and it
needs no third-party request from the visitor's browser.

The exception is attribution. The server sees that an opportunity was
fetched but not which surface the visitor came from — and "does social
discovery actually drive participation" is the question Kynd's thesis rests
on. That, and only that, comes from the browser.

## Envelope

Every line carries:

| Field | Meaning |
| --- | --- |
| `log_type` | Always `kynd_analytics_event` — separates these from ordinary logs |
| `schema_version` | Currently `1`; bumped on a breaking contract change |
| `event` | Event name |
| `ts` | ISO 8601 timestamp |
| `session_id` | The demo session — **the unit of analysis** |
| `user_id` | The temporary demo user |
| `is_demo` | Always `true` |
| `session_age_seconds` | How far into the visit this happened |

`session_age_seconds` is derived from the session expiry the middleware
already resolved, so it costs no extra query.

## Event contract

**16 events.** Thirteen are emitted server-side from the operation itself;
three (`opportunity_viewed`, `fundraiser_viewed`, `discover_viewed`) come
from the frontend bridge, because they need navigation attribution the
server cannot see.

### Session

| Event | Fires | Properties |
| --- | --- | --- |
| `demo_session_started` | A session is created | `is_reset` |
| `demo_reset` | Reset succeeds | — |

`is_reset` is **client-asserted**. The new session shares nothing with the
deleted one, so only the browser knows the two are related. It is a boolean
about intent, never identity, and it influences nothing but this event.

`demo_reset` captures its context *before* the delete (which destroys the
session it describes) and emits *after* the delete succeeds.

### Discovery

| Event | Fires | Properties |
| --- | --- | --- |
| `home_viewed` | Home payload served | `item_count`, `has_second_degree` |
| `discover_viewed` | Discover viewed (frontend) | `mode`: `browse` \| `search` \| `filter` |
| `discover_query_used` | A search or filter is actually applied | `filter_keys[]`, `has_query`, `result_count` |

`discover_query_used` records **which** filters were used, never their
values, and only that a search happened — never the term.

### Opportunity funnel

| Event | Fires | Properties |
| --- | --- | --- |
| `opportunity_viewed` | Detail loads (frontend) | `opportunity_id`, `cause`, `host_type`, `source` |
| `opportunity_joined` | Join succeeds | `opportunity_id`, `cause`, `was_rejoin`, `source?` |
| `opportunity_participation_changed` | Leave succeeds | `opportunity_id`, `state: left`, `hours_before_start` |
| `opportunity_completed` | Completion succeeds | `opportunity_id`, `cause`, `hours`, `has_story`, `is_demo_path` |
| `opportunity_saved` | Save/unsave | `opportunity_id`, `state`: `saved` \| `unsaved` |

`is_demo_path` marks the flagship's early-completion shortcut, which exists
so the full lifecycle can be seen in one sitting. **It must be excluded from
any honest Join → Complete rate.**

### Contribution identity

| Event | Fires | Properties |
| --- | --- | --- |
| `activity_logged` | Manual activity written | `cause`, `hours`, `org_is_kynd`, `has_story` |

Never the title, story, or externally-typed organization name.

### Social

| Event | Fires | Properties |
| --- | --- | --- |
| `follow_changed` | Follow/unfollow | `target_type`, `state`, `surface?` |
| `content_engaged` | Reaction or comment | `target_type`, `kind`, `reaction_type?`, `state?` |

One event covers lightweight social. Reaction `state` is `added` or
`removed`, because undo rate is the interesting part and doesn't warrant its
own name. Comment bodies are never included.

### Fundraising & supply

| Event | Fires | Properties |
| --- | --- | --- |
| `fundraiser_viewed` | Detail loads (frontend) | `fundraiser_id`, `cause`, `source` |
| `fundraiser_supported` | Support succeeds | `fundraiser_id`, `cause`, `amount_bucket` |
| `content_created` | Opportunity or fundraiser published | `type`, `cause`, `is_online?`, `capacity_bucket?` |

Amounts are bucketed (`under_10`, `10_24`, `25_49`, `50_99`, `100_plus`).
The exact amount a specific visitor chose is never recorded.

### Source vocabulary

`home_person`, `home_org`, `home_second_degree`, `home_cause`, `discover`,
`activity_saved`, `activity_upcoming`, `direct`, `other`.

`direct` is a real answer — a deep link or refresh. Attribution is never
invented when the source is unknown.

## The frontend bridge

`POST /api/v1/events` exists solely for attribution. It:

- requires a demo session, and takes identity **only** from it
- accepts only three event names (`opportunity_viewed`, `fundraiser_viewed`,
  `discover_viewed`)
- accepts only the properties each declares, each validated against a
  bounded vocabulary or a UUID format
- **rejects** unknown events, unknown properties, and out-of-vocabulary
  values rather than silently dropping them
- caps property count and is rate-limited

The browser therefore cannot introduce a new event type, attach an arbitrary
property, or smuggle text into the stream. Product events are never routed
through it — a browser-reported Join would be a claim, not a fact.

## Privacy rules

- **Never recorded:** comment text, activity stories, titles, descriptions,
  typed organization names, search terms, exact support amounts, IP
  addresses, user-agent strings.
- **No cookie, no device identifier, no fingerprinting, no cross-session
  identifier.** The session id is backend-issued, opaque, and dies within 24
  hours.
- **Session is the unit of analysis**, not a person.
- Logs live with the hosting provider; retention is the provider's, so no
  retention promise is made.

These rules are enforced by tests, not just documented: a manual-activity
test asserts the visitor's own words appear nowhere in the emitted line.

## Primary metrics

### 1. Opportunity View → Join
`opportunity_joined` ÷ `opportunity_viewed`. Segment by `source` — this is
the acquisition funnel and the closest thing to an intent signal.

### 2. Join → Completion
`opportunity_completed` ÷ `opportunity_joined`, **excluding
`is_demo_path = true`**. The participation outcome that actually matters.

### 3. Contribution-history activation
Share of sessions producing ≥1 activity, by either route — Kynd-originated
completion or `activity_logged`. Tests the "Kynd is my contribution history"
thesis directly, including whether manual logging earns its place.

### 4. Social discovery yield
Compare view→join rates for `source` in Home first-degree
(`home_person`/`home_org`) vs. `home_second_degree` vs. `discover`. This is
the differentiation claim, measured.

### 5. Fundraiser View → Support
`fundraiser_supported` ÷ `fundraiser_viewed`. Whether the third object earns
its place in the product.

### 6. Supply-side activation
Share of sessions emitting `content_created`. Expected to be small — the
shape of a marketplace's hardest side.

**Diagnostic:** leave rate (`opportunity_participation_changed` ÷
`opportunity_joined`) and its `hours_before_start` distribution, as a
marketplace-health signal.

## What these numbers can and cannot mean

**They can** demonstrate that the product's loops were identified,
instrumented deliberately, and can be reasoned about — that measurement was
designed alongside the product rather than bolted on.

**They cannot** be evidence of product-market fit, retention, MAU/DAU,
engagement quality, or real-world volunteering behaviour. Every session is a
temporary demo visitor — largely recruiters and engineers evaluating a
portfolio project, not people looking to volunteer in Atlanta. The
population is wrong, the sample is tiny, and there is no repeat-visit
identity by design.

Reset sessions (`is_reset = true`) should be excluded from or reported
separately in funnel analysis: one person exploring five times is not five
funnels.

Reporting these as product traction would be exactly the overreach this
design is meant to avoid.
