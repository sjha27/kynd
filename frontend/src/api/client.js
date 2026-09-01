// Deliberately tiny: not an API framework, just a fetch wrapper.
//
// Local dev: VITE_API_BASE_URL is unset, so API_BASE_URL is '' and every
// request is a relative /api/... path, which Vite's dev server proxies to
// the local Express backend (see vite.config.js).
//
// Production: Cloudflare Pages sets VITE_API_BASE_URL to the deployed
// Render API origin (e.g. https://api.kynd.shreyashjha.com), and requests
// go straight there.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && body.error && body.error.message) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export { apiGet };
