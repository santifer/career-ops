import type { CandidateProfile } from '../types/profile';
import type { Comment } from '../types/comments';
import type { AgentMessage, ProposedUpdate } from '../types/agent';
import type { AppAction } from './actions';
import { computeReadiness, type ReadinessResult } from '../lib/readiness';

export interface AppState {
  profile: CandidateProfile;
  comments: Comment[];
  messages: AgentMessage[];
  readiness: ReadinessResult;
}

export function createInitialState(profile: CandidateProfile): AppState {
  return {
    profile,
    comments: [],
    messages: [],
    readiness: computeReadiness(profile),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROFILE':
      return { ...state, profile: action.profile, readiness: computeReadiness(action.profile) };

    case 'ADD_COMMENT':
      return { ...state, comments: [...state.comments, action.comment] };

    case 'UPDATE_COMMENT':
      return {
        ...state,
        comments: state.comments.map(c =>
          c.id === action.id ? { ...c, commentText: action.commentText } : c,
        ),
      };

    case 'DELETE_COMMENT':
      return {
        ...state,
        comments: state.comments.filter(c => c.id !== action.id),
      };

    case 'SEND_COMMENTS':
      return {
        ...state,
        comments: state.comments.map(c =>
          c.status === 'pending' ? { ...c, status: 'sent' as const, batchId: action.batchId } : c,
        ),
      };

    case 'RESOLVE_COMMENTS':
      return {
        ...state,
        comments: state.comments.filter(c => c.batchId !== action.batchId),
      };

    case 'RESOLVE_SECTION_COMMENTS':
      return {
        ...state,
        comments: state.comments.filter(c => c.sectionId !== action.sectionId),
      };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.id ? { ...m, ...action.updates } : m,
        ),
      };

    case 'ACCEPT_UPDATE': {
      const newMessages = state.messages.map(m => {
        if (m.id !== action.messageId || !m.updates) return m;
        return {
          ...m,
          updates: m.updates.map(u =>
            u.id === action.updateId ? { ...u, status: 'accepted' as const } : u,
          ),
        };
      });

      // Find the update to apply
      const msg = state.messages.find(m => m.id === action.messageId);
      const update = msg?.updates?.find(u => u.id === action.updateId);

      let newProfile = state.profile;
      if (update) {
        newProfile = applyProposedUpdate(state.profile, update);
      }

      // Check if all updates in the batch are resolved
      const updatedMsg = newMessages.find(m => m.id === action.messageId);
      const allResolved = updatedMsg?.updates?.every(u => u.status !== 'pending') ?? false;
      let newComments = state.comments;
      if (allResolved && updatedMsg?.updates?.[0]?.sourceBatchId) {
        newComments = newComments.filter(
          c => c.batchId !== updatedMsg.updates![0].sourceBatchId,
        );
      }

      // Also clear comments in the mutated section
      if (update) {
        newComments = newComments.filter(c => c.sectionId !== update.section);
      }

      const newReadiness = computeReadiness(newProfile);
      return { ...state, profile: newProfile, messages: newMessages, comments: newComments, readiness: newReadiness };
    }

    case 'EDIT_UPDATE':
      return {
        ...state,
        messages: state.messages.map(m => {
          if (m.id !== action.messageId || !m.updates) return m;
          return {
            ...m,
            updates: m.updates.map(u =>
              u.id === action.updateId
                ? { ...u, proposedValue: action.proposedValue, status: 'edited' as const }
                : u,
            ),
          };
        }),
      };

    case 'IGNORE_UPDATE': {
      const newMessages = state.messages.map(m => {
        if (m.id !== action.messageId || !m.updates) return m;
        return {
          ...m,
          updates: m.updates.map(u =>
            u.id === action.updateId ? { ...u, status: 'ignored' as const } : u,
          ),
        };
      });

      // Check if all updates in the batch are resolved
      const updatedMsg = newMessages.find(m => m.id === action.messageId);
      const allResolved = updatedMsg?.updates?.every(u => u.status !== 'pending') ?? false;
      let newComments = state.comments;
      if (allResolved && updatedMsg?.updates?.[0]?.sourceBatchId) {
        newComments = newComments.filter(
          c => c.batchId !== updatedMsg.updates![0].sourceBatchId,
        );
      }

      return { ...state, messages: newMessages, comments: newComments };
    }

    case 'UPDATE_PROFILE': {
      const newProfile = { ...state.profile, ...action.changes };
      return { ...state, profile: newProfile, readiness: computeReadiness(newProfile) };
    }

    case 'SET_PROFILE_FIELD': {
      const newProfile = setNestedField(state.profile, action.path, action.value);
      return { ...state, profile: newProfile, readiness: computeReadiness(newProfile) };
    }

    default:
      return state;
  }
}

function applyProposedUpdate(
  profile: CandidateProfile,
  update: ProposedUpdate,
): CandidateProfile {
  switch (update.path) {
    case 'cv.summary':
      return { ...profile, cv: { ...profile.cv, summary: applyStringUpdate(profile.cv.summary, update) } };
    case 'narrative.exitStory':
      return {
        ...profile,
        narrative: {
          ...profile.narrative,
          exitStory: applyStringUpdate(profile.narrative.exitStory, update),
        },
      };
    case 'compensation.targetRange':
      return {
        ...profile,
        compensation: {
          ...profile.compensation,
          targetRange: applyStringUpdate(profile.compensation.targetRange, update),
        },
      };
    case 'identity.phone':
      return { ...profile, identity: { ...profile.identity, phone: applyStringUpdate(profile.identity.phone, update) } };
    case 'identity.linkedin':
      return { ...profile, identity: { ...profile.identity, linkedin: applyStringUpdate(profile.identity.linkedin, update) } };
    case 'identity.portfolio':
      return { ...profile, identity: { ...profile.identity, portfolio: applyStringUpdate(profile.identity.portfolio, update) } };
    case 'identity.github':
      return { ...profile, identity: { ...profile.identity, github: applyStringUpdate(profile.identity.github, update) } };
    case 'narrative.superpowers':
      return {
        ...profile,
        narrative: {
          ...profile.narrative,
          superpowers: applyArrayUpdate(profile.narrative.superpowers, update),
        },
      };
    case 'strengths.keyStrengths':
      return {
        ...profile,
        strengths: {
          ...profile.strengths,
          keyStrengths: applyArrayUpdate(profile.strengths.keyStrengths, update),
        },
      };
    case 'dealBreakers':
      return { ...profile, dealBreakers: applyArrayUpdate(profile.dealBreakers, update) };
    case 'targeting.primaryRoles':
      return {
        ...profile,
        targeting: {
          ...profile.targeting,
          primaryRoles: applyArrayUpdate(profile.targeting.primaryRoles, update),
        },
      };
    default:
      return profile;
  }
}

function applyStringUpdate(currentValue: string, update: ProposedUpdate): string {
  const proposedValue = update.proposedValue.trim();

  if (update.operation === 'remove') {
    return currentValue.replace(update.currentValue, '').replace(/\s+/g, ' ').trim();
  }

  if (update.operation === 'append') {
    if (!proposedValue) return currentValue;
    return currentValue ? `${currentValue} ${proposedValue}` : proposedValue;
  }

  if (update.currentValue.trim() && currentValue.includes(update.currentValue)) {
    return currentValue
      .replace(update.currentValue, proposedValue)
      .replace(/\s+/g, ' ')
      .trim();
  }

  return proposedValue;
}

function applyArrayUpdate(currentValues: string[], update: ProposedUpdate): string[] {
  const proposedValue = update.proposedValue.trim();

  if (update.operation === 'remove') {
    const removalTargets = [update.currentValue, update.proposedValue].filter(Boolean);
    return currentValues.filter(item =>
      !removalTargets.some(target => item === target || item.includes(target)),
    );
  }

  if (update.operation === 'replace') {
    const replaced = currentValues.map(item =>
      item === update.currentValue || item.includes(update.currentValue) ? proposedValue : item,
    );
    return replaced.some(item => item === proposedValue)
      ? replaced
      : appendUnique(replaced, proposedValue);
  }

  return appendUnique(currentValues, proposedValue);
}

function appendUnique(values: string[], value: string): string[] {
  if (!value) return values;
  const normalizedValue = value.toLowerCase();
  if (values.some(item => item.toLowerCase() === normalizedValue)) return values;
  return [...values, value];
}

function setNestedField(obj: CandidateProfile, path: string, value: unknown): CandidateProfile {
  const keys = path.split('.');
  const result = JSON.parse(JSON.stringify(obj));
  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}
