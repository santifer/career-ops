import type { Comment } from '../types/comments';
import type { ProfileUpdateOperation, ProfileUpdatePath, ProposedUpdate } from '../types/agent';

interface ProcessResult {
  updates: ProposedUpdate[];
  reasoning: string;
}

export function processComments(
  comments: Comment[],
): ProcessResult {
  const updates: ProposedUpdate[] = [];
  const reasoningParts: string[] = [];

  for (const comment of comments) {
    const intent = classifyIntent(comment.commentText);
    const update = generateUpdate(comment, intent);
    if (update) {
      updates.push(update);
      reasoningParts.push(
        `I understand that "${comment.selectedText.slice(0, 50)}${comment.selectedText.length > 50 ? '...' : ''}" needs to be ${intentLabel(intent)}.`
      );
    }
  }

  return {
    updates,
    reasoning: reasoningParts.length > 0
      ? reasoningParts.join(' ')
      : 'I reviewed your comments but couldn\'t determine specific updates. Could you be more specific about what you\'d like changed?',
  };
}

type Intent = 'reframe' | 'add' | 'remove' | 'emphasize';

function intentLabel(intent: Intent): string {
  if (intent === 'add') return 'added';
  if (intent === 'remove') return 'removed';
  if (intent === 'emphasize') return 'emphasized';
  return 'reframed';
}

function classifyIntent(commentText: string): Intent {
  const lower = commentText.toLowerCase();

  if (lower.includes('reframe') || lower.includes('frame') || lower.includes('position') || lower.includes('rephrase') || lower.includes('reword')) {
    return 'reframe';
  }
  if (lower.includes('emphasize') || lower.includes('emphasise') || lower.includes('stronger') || lower.includes('more important') || lower.includes('lead with') || lower.includes('highlight')) {
    return 'emphasize';
  }
  if (lower.includes('add') || lower.includes('include') || lower.includes('mention') || lower.includes('highlight')) {
    return 'add';
  }
  if (lower.includes('remove') || lower.includes('delete') || lower.includes('drop') || lower.includes('hide')) {
    return 'remove';
  }

  return 'reframe';
}

function generateUpdate(comment: Comment, intent: Intent): ProposedUpdate | null {
  const target = getUpdateTarget(comment.sectionId, intent);
  if (!target) return null;

  let proposedValue = comment.selectedText;
  let reason = comment.commentText;

  switch (intent) {
    case 'reframe':
      // Extract the desired framing from the comment
      proposedValue = extractReframing(comment.commentText, comment.selectedText);
      reason = `You asked to reframe this: "${comment.commentText}"`;
      break;
    case 'add':
      proposedValue = extractAddition(comment.commentText);
      reason = `You asked to add this to your profile: "${comment.commentText}"`;
      break;
    case 'remove':
      proposedValue = '';
      reason = `You asked to remove this: "${comment.commentText}"`;
      break;
    case 'emphasize':
      proposedValue = extractReframing(comment.commentText, comment.selectedText);
      reason = `You want to emphasize this more prominently: "${comment.commentText}"`;
      break;
  }

  return {
    id: crypto.randomUUID(),
    section: comment.sectionId,
    field: target.field,
    path: target.path,
    operation: intent === 'remove' ? 'remove' : target.operation,
    currentValue: comment.selectedText,
    proposedValue,
    reason,
    status: 'pending',
  };
}

interface UpdateTarget {
  field: string;
  path: ProfileUpdatePath;
  operation: ProfileUpdateOperation;
}

function getUpdateTarget(sectionId: string, intent: Intent): UpdateTarget | null {
  if (sectionId === 'searchSources' || sectionId === 'identity') return null;

  if (sectionId === 'cv') {
    return intent === 'reframe' || intent === 'remove'
      ? { field: 'summary', path: 'cv.summary', operation: 'replace' }
      : { field: 'keyStrengths', path: 'strengths.keyStrengths', operation: 'append' };
  }

  if (sectionId === 'narrative') {
    return intent === 'reframe' || intent === 'remove'
      ? { field: 'exitStory', path: 'narrative.exitStory', operation: 'replace' }
      : { field: 'superpowers', path: 'narrative.superpowers', operation: 'append' };
  }

  if (sectionId === 'strengths') {
    return { field: 'keyStrengths', path: 'strengths.keyStrengths', operation: 'append' };
  }

  if (sectionId === 'dealBreakers') {
    return { field: 'dealBreakers', path: 'dealBreakers', operation: 'append' };
  }

  if (sectionId === 'targeting') {
    return { field: 'primaryRoles', path: 'targeting.primaryRoles', operation: 'append' };
  }

  return null;
}

function extractReframing(comment: string, original: string): string {
  // Try to extract "as X" or "to X" pattern
  const asMatch = comment.match(/(?:as|to|into|like)\s+"?([^"]+)"?/i);
  if (asMatch) return asMatch[1].trim();

  // Try to extract quoted text
  const quoteMatch = comment.match(/"([^"]+)"/);
  if (quoteMatch) return quoteMatch[1];

  // Fallback: return a reworded version
  return `${original} (reframed per your feedback)`;
}

function extractAddition(comment: string): string {
  // Try to find what to add
  const addMatch = comment.match(/(?:add|include|mention)\s+"?([^"]+)"?/i);
  if (addMatch) return addMatch[1].trim();

  // Fallback
  return comment;
}
