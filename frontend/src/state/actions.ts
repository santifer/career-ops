import type { Comment } from '../types/comments';
import type { AgentMessage } from '../types/agent';
import type { CandidateProfile } from '../types/profile';

export type AppAction =
  | { type: 'SET_PROFILE'; profile: CandidateProfile }
  | { type: 'ADD_COMMENT'; comment: Comment }
  | { type: 'UPDATE_COMMENT'; id: string; commentText: string }
  | { type: 'DELETE_COMMENT'; id: string }
  | { type: 'SEND_COMMENTS'; batchId: string }
  | { type: 'RESOLVE_COMMENTS'; batchId: string }
  | { type: 'RESOLVE_SECTION_COMMENTS'; sectionId: string }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; updates: Partial<AgentMessage> }
  | { type: 'ACCEPT_UPDATE'; messageId: string; updateId: string }
  | { type: 'EDIT_UPDATE'; messageId: string; updateId: string; proposedValue: string }
  | { type: 'IGNORE_UPDATE'; messageId: string; updateId: string }
  | { type: 'UPDATE_PROFILE'; changes: Partial<CandidateProfile> }
  | { type: 'SET_PROFILE_FIELD'; path: string; value: unknown };
