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
    github: string;
  };
  targeting: {
    primaryRoles: string[];
    archetypes: Archetype[];
    industries: string[];
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
  };
  location: {
    country: string;
    city: string;
    timezone: string;
    visaStatus: string;
    onsiteAvailability: string;
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
