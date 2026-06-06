import { useEffect, useReducer, type ReactNode } from 'react';
import { appReducer, createInitialState } from './appReducer';
import { AppDispatchContext, AppStateContext } from './appContexts';
import { seedProfile } from '../data/seed';
import type { CandidateProfile } from '../types/profile';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, seedProfile, createInitialState);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch('/api/profile', { signal: controller.signal });
        if (!response.ok) return;
        const profile = await response.json() as CandidateProfile;
        dispatch({ type: 'SET_PROFILE', profile });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Using bundled profile seed because /api/profile is unavailable.');
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
