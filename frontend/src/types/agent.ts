import type { Comment } from './comments';

export type MessageType =
  | 'agent-text'
  | 'user-text'
  | 'comment-batch'
  | 'proposed-update'
  | 'job-recommendation'
  | 'readiness-nudge'
  | 'typing';

export interface AgentMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  updates?: ProposedUpdate[];
  comments?: Comment[];
  jobRecommendation?: JobRecommendation;
}

export type UpdateStatus = 'pending' | 'accepted' | 'edited' | 'ignored';

export type ProfileUpdateOperation = 'replace' | 'append' | 'remove';

export type ProfileUpdatePath =
  | 'cv.summary'
  | 'narrative.exitStory'
  | 'narrative.superpowers'
  | 'strengths.keyStrengths'
  | 'dealBreakers'
  | 'targeting.primaryRoles'
  | 'identity.phone'
  | 'identity.linkedin'
  | 'identity.portfolio'
  | 'identity.github'
  | 'compensation.targetRange';

export interface ProposedUpdate {
  id: string;
  section: string;
  field: string;
  path: ProfileUpdatePath;
  operation: ProfileUpdateOperation;
  currentValue: string;
  proposedValue: string;
  reason: string;
  status: UpdateStatus;
  sourceBatchId?: string;
}

export interface JobRecommendation {
  url: string;
  score: string;
  recommendation: 'Worth applying' | 'Maybe' | 'Skip';
  matchReasons: string[];
  risks: string[];
  cta: string;
}
