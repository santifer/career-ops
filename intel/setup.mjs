/**
 * Setup file generators for career-ops intelligence engine onboarding.
 * Generates config and empty tracker files.
 */

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Generate intel.yml configuration YAML from a user profile object.
 * @param {object} profile - parsed profile.yml content
 * @returns {string} YAML string
 */
export function generateIntelYml(profile) {
  const name = profile?.candidate?.full_name ?? 'Your Name';
  const location = profile?.candidate?.location ?? 'Location';
  const roles = (profile?.target_roles?.primary ?? ['Target Role']).join(', ');

  return `# intel.yml — intelligence engine configuration
# Generated ${today()} for ${name}

candidate:
  full_name: "${name}"
  location: "${location}"
  target_roles: [${roles}]

apis:
  exa:
    key_env: EXA_API_KEY
    max_results: 20
  google:
    cx_env: GOOGLE_CX
    key_env: GOOGLE_API_KEY
    max_results: 10
  brightdata:
    key_env: BRIGHTDATA_API_KEY
    zone: residential

google:
  alerts:
    - query: "${roles} hiring ${location}"
    - query: "${roles} open roles"

schedules:
  scan_interval_hours: 72
  briefing_day: monday
  prospect_refresh_days: 7

gemma:
  enabled: false
  model: gemma-3
  tasks:
    - classify_prospects
    - summarize_intel
`;
}

/**
 * Generate empty outreach tracker markdown.
 * @returns {string} markdown content for data/outreach.md
 */
export function generateEmptyTracker() {
  return `# Outreach Tracker

## Queue

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|

## Drafts

_No drafts yet._

## Sent

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|

## Closed

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|
`;
}

/**
 * Generate empty prospects tracker markdown.
 * @returns {string} markdown content for data/prospects.md
 */
export function generateEmptyProspects() {
  return `# Prospects

## New (unreviewed)

| # | Found | Company | Role | Why It Fits You | Approach Angle | Source | URL |
|---|-------|---------|------|-----------------|----------------|--------|-----|

## Reviewed->Pipeline

_Prospects promoted to the application pipeline._

## Dismissed

_Prospects that didn't fit._

## Expired

_Prospects that expired before review._
`;
}

/**
 * Generate empty intelligence briefing markdown.
 * @returns {string} markdown content for data/intelligence.md
 */
export function generateEmptyIntelligence() {
  return `# Intelligence Briefing

_Generated ${today()}_

No intelligence collected yet. Run a scan or configure API keys in \`intel.yml\` to start.

---

## Archive

_Previous briefings will be archived here._
`;
}
