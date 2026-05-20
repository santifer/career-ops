# LinkedIn Liveness Sweep — 2026-05-20

Probed 48 LinkedIn-hosted URLs via CDP-authenticated Chrome at 127.0.0.1:9222.
Mode: live (tracker writes applied via markRowAsExpired).

## Summary

- **active:** 40
- **expired → auto-discarded:** 8 (all status=Evaluated)
- **uncertain:** 0
- **errors:** 0

Runtime: ~4 min 20s sequential w/ 1.5s inter-request delay.

## Per-row results (expired first)

| # | Status (was) | Result | Company | Role | Reason |
|---|--------------|--------|---------|------|--------|
| 2235 | Evaluated | expired | NetApp | Executive Communications Lead | phrase: "No longer accepting applications" |
| 2236 | Evaluated | expired | Rimini Street | Director, Content | phrase: "No longer accepting applications" |
| 2243 | Evaluated | expired | Amazon Web Services (AWS) | Senior AI Innovation & GTM Programs Lead, Applied  | phrase: "No longer accepting applications" |
| 2247 | Evaluated | expired | Solventum | Manager, External Communications and Editorial Cha | phrase: "No longer accepting applications" |
| 2219 | Evaluated | expired | Unknown | Corporate Communications Specialist (expired posti | phrase: "No longer accepting applications" |
| 2191 | Evaluated | expired | OpenAI | Visual Storytelling & Innovation Lead, Office of t | phrase: "No longer accepting applications" |
| 2197 | Evaluated | expired | Mark43 | Enterprise AI Enablement Lead | phrase: "No longer accepting applications" |
| 2067 | Evaluated | expired | ElevenLabs | GTM Agentic Enablement Lead | phrase: "No longer accepting applications" |
| 2237 | Evaluated | active | Binance | Pioneer Talent Program - AI Agent Engineer | strong+weak signals present |
| 2238 | Evaluated | active | Red Hat | Senior AI Architect, APAC | strong+weak signals present |
| 2239 | Evaluated | active | Amazon Web Services (AWS) | Senior AI Solution Architect | strong+weak signals present |
| 2240 | Evaluated | active | Stripe | Design Program Manager, AI | strong+weak signals present |
| 2241 | Evaluated | active | SentiLink | AI Strategy and Process Lead | strong+weak signals present |
| 2242 | Evaluated | active | Sia | AI Delivery Lead | strong+weak signals present |
| 2244 | Evaluated | active | Google | Product Strategy and Operations Lead, AI and Infra | strong+weak signals present |
| 2245 | Evaluated | active | Microsoft | Senior Communications Manager | strong+weak signals present |
| 2246 | Evaluated | active | General Motors | Sr. Manager Communications, Product and Technology | strong+weak signals present |
| 2248 | Evaluated | active | Loot Labs, Inc | Senior Editorial Lead | strong+weak signals present |
| 2249 | Evaluated | active | Intersect | AI Solutions | strong+weak signals present |
| 2230 | Evaluated | active | Genesys | Senior AI Architect (Presales) | strong+weak signals present |
| 2231 | Evaluated | active | Dandy | Head of Storytelling | strong+weak signals present |
| 2232 | Evaluated | active | GEICO | Distinguished Engineer, AI Applications | strong+weak signals present |
| 2233 | Evaluated | active | Netflix | Tech Lead Manager, GenAI Sandbox & Tooling (AI Fou | strong+weak signals present |
| 2234 | Evaluated | active | Jobgether (Partner Company) | Program Manager, Sustainability Communications | strong+weak signals present |
| 2216 | Evaluated | active | Valon | Applied AI Strategist, New Ventures | strong+weak signals present |
| 2220 | Evaluated | active | NVIDIA | Executive Communications Manager | strong+weak signals present |
| 2221 | Evaluated | active | The Mutual Group | Principal AI Engineering Architect | strong+weak signals present |
| 2223 | Evaluated | active | Lenovo | Head of AI Architecture & Innovation | strong+weak signals present |
| 2226 | Evaluated | active | Snowflake | Director, Executive Communications | strong+weak signals present |
| 2186 | Evaluated | active | OpenAI | Solutions Architect, Digital Natives | strong+weak signals present |
| 2188 | Evaluated | active | LangChain | Solutions Architect (Remote) | strong+weak signals present |
| 2193 | Evaluated | active | OpenAI | Partner AI Deployment Engineer | strong+weak signals present |
| 2194 | Evaluated | active | Anthropic | Applied AI Architect, Industries | strong+weak signals present |
| 2195 | Evaluated | active | Amazon | Senior Technical Program Manager, GenAI Games | strong+weak signals present |
| 2196 | Evaluated | active | Anthropic | Manager of Solutions Architecture, Applied AI (Ind | strong+weak signals present |
| 2198 | Evaluated | active | OpenAI | AI Deployment Manager - Pilots | strong+weak signals present |
| 2199 | Evaluated | active | NVIDIA | Senior GenAI Engagement Lead, Partner Platforms | strong+weak signals present |
| 2210 | Evaluated | active | Actively AI | AI Solutions Architect | strong+weak signals present |
| 2211 | Evaluated | active | Anthropic | Applied AI Architect, Commercial | strong+weak signals present |
| 2213 | Evaluated | active | DigitalOcean | Senior Solutions Architect II, AI/ML | strong+weak signals present |
| 2215 | Evaluated | active | NVIDIA AI | Executive Communications Manager | strong+weak signals present |
| 2093 | Evaluated | active | Komodo Health | AI Enablement Lead (Mavens) | strong+weak signals present |
| 2066 | Evaluated | active | Anthropic | Solutions Architect, National Security | strong+weak signals present |
| 2069 | Evaluated | active | LangChain | Deployed Engineer (San Diego) | strong+weak signals present |
| 2072 | Evaluated | active | Kana | AI Solutions Lead | strong+weak signals present |
| 2074 | Evaluated | active | Microsoft | Senior Technical Program Manager, Core AI Platform | strong+weak signals present |
| 2060 | Evaluated | active | FXI | Head of AI Enablement | strong+weak signals present |
| 2037 | Evaluated | active | Airtable | AI Agent Architect, Customer Experience | strong+weak signals present |

Companion files:
- Log: `data/logs/linkedin-liveness-2026-05-20.log`
- Targets (still-active after sweep): `data/linkedin-liveness-targets-2026-05-20.json`
- State: `data/liveness-state.json`