import type { CandidateProfile } from '../types/profile';
import type { Comment } from '../types/comments';
import type { AgentMessage } from '../types/agent';
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
        newProfile = applyUpdate(state.profile, update.section, update.field, update.proposedValue);
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

function applyUpdate(
  profile: CandidateProfile,
  section: string,
  field: string,
  value: string,
): CandidateProfile {
  const p = { ...profile };

  // Handle common update patterns
  if (section === 'identity') {
    p.identity = { ...p.identity, [field]: value };
  } else if (section === 'targeting') {
    if (field === 'primaryRoles') {
      p.targeting = { ...p.targeting, primaryRoles: [...p.targeting.primaryRoles, value] };
    } else {
      p.targeting = { ...p.targeting, [field]: value };
    }
  } else if (section === 'narrative') {
    if (field === 'superpowers') {
      p.narrative = { ...p.narrative, superpowers: [...p.narrative.superpowers, value] };
    } else {
      p.narrative = { ...p.narrative, [field]: value };
    }
  } else if (section === 'compensation') {
    p.compensation = { ...p.compensation, [field]: value };
  } else if (section === 'dealBreakers') {
    p.dealBreakers = [...p.dealBreakers, value];
  } else if (section === 'strengths') {
    if (field === 'keyStrengths') {
      p.strengths = { ...p.strengths, keyStrengths: [...p.strengths.keyStrengths, value] };
    }
  } else if (section === 'cv') {
    if (field === 'summary') {
      p.cv = { ...p.cv, summary: value };
    }
  }

  return p;
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
