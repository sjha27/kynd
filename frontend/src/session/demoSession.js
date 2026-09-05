/*
 * Demo-session storage and bootstrap.
 *
 * Kynd has no authentication. A visitor gets a backend-generated session UUID
 * that maps to one temporary user; the browser only ever stores and echoes
 * that opaque value. It never invents an id, and it never stores or sends the
 * temporary user's id — the session UUID is the whole transport.
 */

const STORAGE_KEY = 'kynd_demo_session_id';

// localStorage throws in some privacy modes, so every access is guarded and
// degrades to "no stored session" rather than breaking the app.
export function readStoredSessionId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSessionId(sessionId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, sessionId);
  } catch {
    /* non-fatal: the session simply won't survive a reload */
  }
}

export function clearStoredSessionId() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export { STORAGE_KEY };
