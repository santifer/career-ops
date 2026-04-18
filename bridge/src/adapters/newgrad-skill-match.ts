const TEXT_BOUNDARY_PREFIX = "(?:^|[^A-Za-z0-9])";
const TEXT_BOUNDARY_SUFFIX = "(?=$|[^A-Za-z0-9])";

const SKILL_ALIASES: Readonly<Record<string, string>> = {
  ai: "(?:a\\.?i\\.?|artificial\\s+intelligence)",
  "ai customer service agent": "ai\\s+customer\\s+service\\s+agent|customer\\s+service\\s+agent",
  api: "apis?",
  "automated testing": "automated\\s+testing|test\\s+automation",
  "back-pressure handling": "back[-\\s]+pressure(?:\\s+handling)?",
  "batch processing": "batch\\s+processing",
  "c/c++": "(?:c\\s*/\\s*c\\+\\+|c\\+\\+(?:\\d+)?|c\\s+programming|c\\s+language)",
  "c++": "c\\+\\+(?:\\d+)?",
  "ci/cd": "ci\\s*/\\s*cd(?:\\s+pipeline)?",
  "ci/cd pipeline": "ci\\s*/\\s*cd(?:\\s+pipeline)?",
  "computer networks": "computer\\s+networks?|networking",
  "cors/csrf protection": "cors\\s*/\\s*csrf(?:\\s+protection)?|cors|csrf",
  "data structures and algorithms": "data\\s+structures\\s+and\\s+algorithms|data\\s+structures|algorithms",
  "database systems": "database\\s+systems?",
  "distributed systems": "distributed\\s+systems?",
  "event-driven architecture": "event[-\\s]+driven(?:\\s+architecture)?",
  "function calling": "function\\s+calling",
  "geospatial data processing": "geospatial(?:\\s+data\\s+processing)?",
  "github actions": "github\\s+actions",
  "heartbeat optimization": "heartbeat(?:\\s+optimization)?",
  "high-concurrency": "high[-\\s]+concurrency|highly\\s+concurrent",
  "html/css": "html\\s*/\\s*css|html5?|css3?",
  http: "https?",
  ios: "ios",
  "ios sdk": "ios\\s+sdk",
  "ios/swift": "ios\\s*/\\s*swift|ios|swift",
  "junit 5": "junit\\s*5",
  "linux/unix": "linux|unix",
  llm: "llms?",
  "microservices architecture": "microservices?(?:\\s+architecture)?",
  "mobile app development": "mobile\\s+app(?:\\s+development)?",
  "node.js": "node(?:\\.js|js)?",
  openapi: "open\\s*api|openapi",
  "openrouter api": "openrouter\\s+api",
  postgres: "postgres(?:ql)?",
  rag: "rag",
  r: "r\\s+programming|r\\s+language|r(?=\\s*(?:[,;/]|and\\b|or\\b|$))",
  "rate limiting": "rate\\s+limiting",
  rest: "rest(?:ful)?",
  "security frameworks": "security\\s+frameworks?",
  "spring (ioc, aop)": "spring\\s*(?:\\(\\s*)?(?:ioc|aop)(?:\\s*,\\s*(?:ioc|aop))*\\s*\\)?|spring\\s+framework",
  "transactional outbox pattern": "transactional\\s+outbox(?:\\s+pattern)?",
  websocket: "websockets?",
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSkillPattern = (term: string): RegExp | null => {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return null;

  const source =
    SKILL_ALIASES[normalized] ??
    escapeRegExp(term.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`${TEXT_BOUNDARY_PREFIX}(?:${source})${TEXT_BOUNDARY_SUFFIX}`, "i");
};

export const skillKeywordMatches = (text: string, term: string): boolean => {
  const pattern = buildSkillPattern(term);
  return pattern ? pattern.test(text) : false;
};

export const findSkillKeywordMatches = (
  text: string,
  terms: readonly string[],
): string[] => {
  const matched = new Set<string>();
  for (const term of terms) {
    if (skillKeywordMatches(text, term)) {
      matched.add(term);
    }
  }
  return Array.from(matched);
};
