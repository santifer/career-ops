export interface CandidateProfile {
  identity: {
    name: string;
    email: string;
    phone: string;
    location: string;
    timezone: string;
    languages: string[];
    linkedin: string;
    portfolio: string;
    substack: string;
    github: string;
  };
  targeting: {
    primaryRoles: string[];
    secondaryRoles: string[];
    archetypes: Archetype[];
    industries: string[];
    notRelevantRoles: string[];
  };
  narrative: {
    headline: string;
    exitStory: string;
    superpowers: string[];
    proofPoints: ProofPoint[];
  };
  compensation: {
    targetRange: string;
    currency: string;
    minimum: string;
    locationFlexibility: string;
    floors: {
      australia: string;
      taiwan: string;
    };
    exceptionsAllowed: string;
  };
  location: {
    country: string;
    city: string;
    timezone: string;
    visaStatus: string;
    onsiteAvailability: string;
    remotePreference: string;
    relocationPreference: string;
    hybridTolerance: string;
  };
  strengths: {
    skills: Record<string, string[]>;
    keyStrengths: string[];
  };
  dealBreakers: string[];
  cv: {
    summary: string;
    experience: ExperienceEntry[];
    education: string[];
    skills: Record<string, string[]>;
  };
  searchSources: SearchSources;
  proofPoints: ProofPointSection[];
  profileMd: {
    archetypes: ProfileArchetype[];
    framingRules: string[];
    compTargets: CompTarget[];
  };
  setup: SetupStatus;
}

export interface Archetype {
  name: string;
  level: string;
  fit: string;
}

export interface ProofPoint {
  name: string;
  heroMetric: string;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

export interface SearchSources {
  totalCompanies: number;
  enabledCompanies: number;
  positiveKeywords: string[];
  negativeKeywords: string[];
  seniorityBoost: string[];
  allowedRegions: string[];
  alwaysAllowedRegions: string[];
  blockedRegions: string[];
  searchQueries: string[];
  enabledSearchQueries: number;
  companyNames: string[];
}

export interface ProofPointSection {
  section: string;
  bullets: string[];
}

export interface ProfileArchetype {
  name: string;
  axes: string;
  whatTheyBuy: string;
}

export interface CompTarget {
  roleType: string;
  market: string;
  range: string;
}

export interface SetupStatus {
  files: {
    cvExists: boolean;
    cvHasContent: boolean;
    articleDigestExists: boolean;
    articleDigestHasContent: boolean;
    articleDigestHasLinks: boolean;
    pipelineExists: boolean;
    applicationsExists: boolean;
  };
  pdf: {
    outputFormat: string;
    autoPdfScoreThreshold: string;
  };
  systemHealth: {
    doctorScriptExists: boolean;
    verifyScriptExists: boolean;
    scanScriptExists: boolean;
  };
}
