import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createDemoSession, fetchCurrentDemoSession } from '../api/client';
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
   * Children render immediately rather than waiting on the session. Discover
   * and every other current surface are public reads that do not need a
   * visitor, so gating the whole app behind this request would add a blank
   * frame to a cold Render start for no benefit.
   */
  return (
    <DemoSessionContext.Provider value={state}>{children}</DemoSessionContext.Provider>
  );
}

export default DemoSessionProvider;
