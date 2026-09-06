import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createDemoSession,
  fetchCurrentDemoSession,
  deleteCurrentDemoSession,
} from '../api/client';
import {
  readStoredSessionId,
  writeStoredSessionId,
  clearStoredSessionId,
} from './demoSession';

/*
 * Bootstraps the visitor's demo session once per browser.
 *
 *   stored id?  -> validate it against the API
 *     valid     -> keep it
 *     invalid   -> discard, create a fresh one
 *   no id       -> create one
 *
 * The whole thing is invisible: no login screen, no onboarding, no name
 * prompt. The visitor just becomes someone who can act.
 *
 * Sessions last 24 hours, so a browser normally holds one for that long
 * across reloads and navigation. Routing happens inside this provider, so
 * bootstrap runs on mount only — never per route change.
 */
const DemoSessionContext = createContext({ status: 'loading', session: null });

export function useDemoSession() {
  return useContext(DemoSessionContext);
}

export function DemoSessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', session: null });

  /*
   * React 18+ Strict Mode runs effects twice in development. Without a guard
   * that means two POSTs and two orphaned temporary users on every dev boot.
   * A ref (not state) is the guard, because it must survive the remount
   * without triggering another render.
   */
  const bootstrapped = useRef(false);

  const bootstrap = useCallback(async () => {
    const storedId = readStoredSessionId();

    if (storedId) {
      try {
        const session = await fetchCurrentDemoSession();
        setState({ status: 'ready', session });
        return;
      } catch (error) {
        // 401 means missing/malformed/unknown/expired — all recoverable by
        // starting over. Anything else (offline, 500, cold start) must NOT
        // discard a possibly-valid session or mint a duplicate user.
        if (error.status !== 401) {
          setState({ status: 'error', session: null });
          return;
        }
        clearStoredSessionId();
      }
    }

    try {
      const session = await createDemoSession();
      writeStoredSessionId(session.sessionId);
      setState({ status: 'ready', session });
    } catch {
      setState({ status: 'error', session: null });
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    bootstrap();
  }, [bootstrap]);

  /*
   * Reset Demo.
   *
   * Order matters: the backend deletes first and is authoritative. Clearing
   * localStorage alone would strand the temporary user and every row they
   * created, with no way for anyone to reach them again.
   *
   * A 401 on the delete means the session was already gone (expired, or
   * reset in another tab) — the visitor's intent is satisfied either way, so
   * it continues to a fresh session rather than failing.
   *
   * `resetKey` increments on success so session-dependent screens can
   * re-read; every one of them already keys its fetches off the session
   * context, and the header the API client sends is read at request time.
   */
  const reset = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'resetting' }));

    try {
      await deleteCurrentDemoSession();
    } catch (error) {
      if (error.status !== 401) {
        setState((prev) => ({ ...prev, status: 'ready' }));
        throw error;
      }
    }

    clearStoredSessionId();

    try {
      const session = await createDemoSession();
      writeStoredSessionId(session.sessionId);
      setState((prev) => ({ status: 'ready', session, resetKey: (prev.resetKey ?? 0) + 1 }));
    } catch (error) {
      // The old session is genuinely gone, so there is nothing to restore.
      setState({ status: 'error', session: null });
      throw error;
    }
  }, []);

  /*
   * Children render immediately rather than waiting on the session. Discover
   * and every other current surface are public reads that do not need a
   * visitor, so gating the whole app behind this request would add a blank
   * frame to a cold Render start for no benefit.
   */
  return (
    <DemoSessionContext.Provider value={{ ...state, reset }}>
      {children}
    </DemoSessionContext.Provider>
  );
}

export default DemoSessionProvider;
