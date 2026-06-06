import { useContext, type Dispatch } from 'react';
import type { AppAction } from './actions';
import type { AppState } from './appReducer';
import { AppDispatchContext, AppStateContext } from './appContexts';

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
}
