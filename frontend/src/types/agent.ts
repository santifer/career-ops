import type { Comment } from './comments';

export type MessageType =
  | 'agent-text'
  | 'user-text'
  | 'comment-batch'
  | 'proposed-update'
  | 'readiness-nudge'
  | 'typing';

export interface AgentMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  updates?: ProposedUpdate[];
  comments?: Comment[];
}

export type UpdateStatus = 'pending' | 'accepted' | 'edited' | 'ignored';

export interface ProposedUpdate {
  id: string;
  section: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  status: UpdateStatus;
  sourceBatchId?: string;
}
