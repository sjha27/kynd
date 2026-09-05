// Deliberately tiny: not an API framework, just a fetch wrapper.
//
// Local dev: VITE_API_BASE_URL is unset, so API_BASE_URL is '' and every
// request is a relative /api/... path, which Vite's dev server proxies to
// the local Express backend (see vite.config.js).
//
// Production: Cloudflare Pages sets VITE_API_BASE_URL to the deployed
// Render API origin (e.g. https://api.kynd.shreyashjha.com), and requests
// go straight there.
import { readStoredSessionId } from '../session/demoSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const SESSION_HEADER = 'X-Kynd-Session-Id';

/*
 * The single place the demo-session header is attached.
 *
 * Read at request time rather than captured once, so a session created or
 * replaced after module load is picked up without re-wiring anything. Every
 * future session-aware feature gets the header for free; none of them should
 * set it themselves.
 */
function withSessionHeader(headers = {}) {
  const sessionId = readStoredSessionId();
  return sessionId ? { ...headers, [SESSION_HEADER]: sessionId } : headers;
}

// Errors carry the backend's machine-readable code (e.g. demo_session_invalid)
// so callers can branch on it without matching prose.
function apiError(response, body) {
  const message =
    (body && body.error && body.error.message) ||
    `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.code = body && body.error && body.error.code;
  return error;
}

async function apiGet(path, { signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: withSessionHeader(),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) throw apiError(response, body);
  return body;
}

async function apiPost(path, { signal, body: payload } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    signal,
    headers: withSessionHeader(
      payload === undefined ? {} : { 'Content-Type': 'application/json' }
    ),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) throw apiError(response, body);
  return body;
}

async function apiDelete(path, { signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    signal,
    headers: withSessionHeader(),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) throw apiError(response, body);
  return body;
}

// Drops null/undefined/empty values so an unset filter never appears in the
// URL as `type=`, keeping requests (and the shareable address bar) clean.
function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function fetchOpportunities(params, options) {
  return apiGet(`/api/v1/opportunities${buildQuery(params)}`, options);
}

function fetchOpportunity(id, options) {
  return apiGet(`/api/v1/opportunities/${id}`, options);
}

// Creation never sends a host: the backend takes it from the session, so a
// published opportunity is always hosted by the visitor who created it.
function createOpportunity(input, options) {
  return apiPost('/api/v1/opportunities', { ...options, body: input });
}

// Join takes no body: the backend derives the acting user from the session.
function joinOpportunity(id, options) {
  return apiPost(`/api/v1/opportunities/${id}/join`, options);
}

// Completion reads hours/story from the body — the visitor's own input
// about their own participation, not a way to act as someone else.
function completeOpportunity(id, { hours, story }, options) {
  return apiPost(`/api/v1/opportunities/${id}/complete`, { ...options, body: { hours, story } });
}

function fetchActivity(options) {
  return apiGet('/api/v1/activity', options);
}

// Manual logging: contribution that happened outside Kynd. The acting user
// still comes from the session — the body is only the visitor's account of
// their own participation.
function logActivity({ title, causeName, organizationName, occurredOn, hours, story }, options) {
  return apiPost('/api/v1/activities', {
    ...options,
    body: { title, causeName, organizationName, occurredOn, hours, story },
  });
}

function fetchHome(options) {
  return apiGet('/api/v1/home', options);
}

function fetchFundraisers(params, options) {
  return apiGet(`/api/v1/fundraisers${buildQuery(params)}`, options);
}

function fetchFundraiser(id, options) {
  return apiGet(`/api/v1/fundraisers/${id}`, options);
}

// Simulated support: the body carries only the amount the visitor chose.
// There are no payment fields, because no payment is processed, and the
// supporter comes from the session.
function supportFundraiser(id, { amountCents }, options) {
  return apiPost(`/api/v1/fundraisers/${id}/support`, { ...options, body: { amountCents } });
}

// Creation never sends a creator: the backend takes it from the session.
function createFundraiser(input, options) {
  return apiPost('/api/v1/fundraisers', { ...options, body: input });
}

function fetchUserProfile(id, options) {
  return apiGet(`/api/v1/users/${id}/profile`, options);
}

function fetchOrganization(id, options) {
  return apiGet(`/api/v1/organizations/${id}`, options);
}

// Follow/unfollow take no body: the acting visitor comes from the session,
// same rule as Join.
function followUser(id, options) {
  return apiPost(`/api/v1/users/${id}/follow`, options);
}

function unfollowUser(id, { signal } = {}) {
  return apiDelete(`/api/v1/users/${id}/follow`, { signal });
}

function followOrganization(id, options) {
  return apiPost(`/api/v1/organizations/${id}/follow`, options);
}

function unfollowOrganization(id, { signal } = {}) {
  return apiDelete(`/api/v1/organizations/${id}/follow`, { signal });
}

function createDemoSession(options) {
  return apiPost('/api/v1/demo-sessions', options);
}

function fetchCurrentDemoSession(options) {
  return apiGet('/api/v1/demo-sessions/current', options);
}

export {
  apiGet,
  apiPost,
  apiDelete,
  buildQuery,
  fetchOpportunities,
  fetchOpportunity,
  createOpportunity,
  joinOpportunity,
  completeOpportunity,
  fetchActivity,
  logActivity,
  fetchFundraisers,
  fetchFundraiser,
  supportFundraiser,
  createFundraiser,
  fetchHome,
  createDemoSession,
  fetchCurrentDemoSession,
  fetchUserProfile,
  fetchOrganization,
  followUser,
  unfollowUser,
  followOrganization,
  unfollowOrganization,
  SESSION_HEADER,
};
