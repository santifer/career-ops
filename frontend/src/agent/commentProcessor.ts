import type { Comment } from '../types/comments';
import type { CandidateProfile } from '../types/profile';
import type { ProposedUpdate } from '../types/agent';

interface ProcessResult {
  updates: ProposedUpdate[];
  reasoning: string;
}

export function processComments(
  comments: Comment[],
  _profile: CandidateProfile,
): ProcessResult {
  const updates: ProposedUpdate[] = [];
  const reasoningParts: string[] = [];

  for (const comment of comments) {
    const intent = classifyIntent(comment.commentText);
    const update = generateUpdate(comment, intent);
    if (update) {
      updates.push(update);
      reasoningParts.push(
        `I understand that "${comment.selectedText.slice(0, 50)}${comment.selectedText.length > 50 ? '...' : ''}" should be ${intent}d.`
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

function classifyIntent(commentText: string): Intent {
  const lower = commentText.toLowerCase();

  if (lower.includes('reframe') || lower.includes('frame') || lower.includes('position') || lower.includes('rephrase') || lower.includes('reword')) {
    return 'reframe';
  }
  if (lower.includes('add') || lower.includes('include') || lower.includes('mention') || lower.includes('highlight')) {
    return 'add';
  }
  if (lower.includes('remove') || lower.includes('delete') || lower.includes('drop') || lower.includes('hide')) {
    return 'remove';
  }
  if (lower.includes('emphasize') || lower.includes('emphasise') || lower.includes('stronger') || lower.includes('more important') || lower.includes('lead with')) {
    return 'emphasize';
  }

  return 'reframe';
}

function generateUpdate(comment: Comment, intent: Intent): ProposedUpdate | null {
  const sectionMap: Record<string, string> = {
    'identity': 'identity',
    'targeting': 'targeting',
    'narrative': 'narrative',
    'strengths': 'strengths',
    'dealBreakers': 'dealBreakers',
    'cv': 'cv',
    'searchSources': 'searchSources',
  };

  const section = sectionMap[comment.sectionId] || comment.sectionId;

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
      proposedValue = `[Key strength] ${comment.selectedText}`;
      reason = `You want to emphasize this more prominently: "${comment.commentText}"`;
      break;
  }

  return {
    id: crypto.randomUUID(),
    section,
    field: intent === 'add' ? 'keyStrengths' : 'summary',
    currentValue: comment.selectedText,
    proposedValue,
    reason,
    status: 'pending',
  };
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
