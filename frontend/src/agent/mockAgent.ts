import type { AgentMessage } from '../types/agent';
import type { Comment } from '../types/comments';
import type { CandidateProfile } from '../types/profile';
import type { ReadinessResult } from '../lib/readiness';
import { getNextOnboardingQuestion } from './onboarding';
import { processComments } from './commentProcessor';
import { handleFreeform } from './freeformHandler';

export type AgentInput =
  | { type: 'init' }
  | { type: 'comments'; comments: Comment[] }
  | { type: 'freeform'; text: string };

export type AgentContext = {
  profile: CandidateProfile;
  readiness: ReadinessResult;
};

export function processAgentResponse(
  input: AgentInput,
  context: AgentContext,
): AgentMessage[] {
  switch (input.type) {
    case 'init':
      return handleInit(context);
    case 'comments':
      return handleCommentBatch(input.comments);
    case 'freeform':
      return handleFreeformInput(input.text, context);
    default:
      return [];
  }
}

function handleInit(context: AgentContext): AgentMessage[] {
  const messages: AgentMessage[] = [];

  messages.push(msg('agent-text',
    `Hi ${context.profile.identity.name || 'there'}! I've loaded your profile into the panel on the left. You can chat with me, or highlight any sentence and tell me how to understand it.`
  ));

  const question = getNextOnboardingQuestion(context.profile);
  if (question) {
    messages.push(msg('agent-text', question));
  } else {
    messages.push(msg('agent-text',
      'Your profile looks quite complete. The fastest way to improve it now is to highlight a phrase on the left, add a comment, and approve the update I propose.'
    ));
  }

  return messages;
}

function handleCommentBatch(comments: Comment[]): AgentMessage[] {
  const { updates, reasoning } = processComments(comments);

  const messages: AgentMessage[] = [];

  if (reasoning) {
    messages.push(msg('agent-text', reasoning));
  }

  if (updates.length > 0) {
    const batchId = comments[0]?.batchId;
    messages.push({
      id: crypto.randomUUID(),
      type: 'proposed-update',
      content: `I found ${updates.length} update${updates.length > 1 ? 's' : ''} based on your comments:`,
      timestamp: Date.now(),
      updates: updates.map(u => ({ ...u, sourceBatchId: batchId })),
    });
  }

  return messages;
}

function handleFreeformInput(text: string, context: AgentContext): AgentMessage[] {
  const result = handleFreeform(text, context);

  const messages: AgentMessage[] = [];

  if (result.response) {
    messages.push(msg('agent-text', result.response));
  }

  if (result.updates && result.updates.length > 0) {
    messages.push({
      id: crypto.randomUUID(),
      type: 'proposed-update',
      content: '',
      timestamp: Date.now(),
      updates: result.updates,
    });
  }

  if (result.jobRecommendation) {
    messages.push({
      id: crypto.randomUUID(),
      type: 'job-recommendation',
      content: 'Demo job recommendation',
      timestamp: Date.now(),
      jobRecommendation: result.jobRecommendation,
    });
  }

  if (result.followUp) {
    messages.push(msg('agent-text', result.followUp));
  }

  return messages;
}

function msg(type: AgentMessage['type'], content: string): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    timestamp: Date.now(),
  };
}
