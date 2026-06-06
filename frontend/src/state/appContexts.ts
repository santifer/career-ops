import { createContext, type Dispatch } from 'react';
import type { AppAction } from './actions';
import type { AppState } from './appReducer';

export const AppStateContext = createContext<AppState | null>(null);
export const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null);
