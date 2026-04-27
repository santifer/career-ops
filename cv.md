# Yi-Chen Lee

**Frontend Engineer**

📧 yichen.lee.20@gmail.com | 📱 +886-955-072-502 | [LinkedIn](http://www.linkedin.com/in/yichenlee-career) | [GitHub](https://github.com/mshmwr)

---

## Professional Summary

Passionate Frontend Engineer with 4+ years of experience building high-traffic B2C web applications at the world's largest cryptocurrency exchange. Specialized in React and TypeScript development with proven track record of improving user conversion rates and leading complex feature migrations serving millions of users. Experienced in cross-functional collaboration across global teams, delivering user-facing features with comprehensive testing and documentation. Known for thoughtful problem-solving, attention to detail, and commitment to code quality.

---

## Skills

| Category | Skills |
|----------|--------|
| **Languages** | JavaScript (ES6+), TypeScript, HTML, CSS |
| **Frontend** | React (Hooks, Router), Redux, Redux Toolkit, Next.js, Styled-Components, Tailwind CSS, Electron, Formik |
| **Testing & Experimentation** | Jest, React Testing Library, Playwright, Unit Testing, A/B Testing (Themis), TDD |
| **Dev Tools** | Git, NPM, Webpack, Chrome DevTools, Charles, Postman |
| **AI Tools** | Cursor, Claude Code, Codex — applied to daily development cycles for velocity optimization and code quality; experienced in agentic workflows and autonomous testing pipelines |
| **Monitoring & Analytics** | Keter (Log Analysis), Sensor (User Behavior Analytics), Sentry (Error Tracking) |
| **Backend** | Node.js, Express, Python, Flask, MySQL |
| **DevOps & CI/CD** | Jenkins, AWS EC2, Shell Script, Kubernetes |
| **Collaboration** | Agile/Scrum, Jira, Confluence, Cross-functional Team Coordination, Code Review |
| **Languages** | Mandarin (Native), English (Professional - TOEIC High Intermediate), Japanese (JLPT N2) |

---

## Work Experience

### Binance — Frontend Engineer
**Nov 2021 - Present**

#### KYC Team (2022 - Present)

- **Boosted 7-day KYC conversion rate from 12.19% to 20.03%** by refactoring verification flows into a fully configurable architecture, replacing hardcoded logic with frontend-maintained configurations to dynamically render UI across all verification scenarios.
<!-- GCC Single ID Flow - SA ID document type config change; Themis A/B experiment -->

- **Enabled new market expansion with a 14.5% lifetime KYC pass rate** by centralizing scattered country-specific configurations across a 5-country verification flow, eliminating the logic sprawl that made new country integrations error-prone.
<!-- GCC - South Africa (ZA) Enablement; GCC countries: SA, UAE, Kuwait, Bahrain, Qatar -->

- **Led development of a compliance-driven migration flow for regional entity requirements**, integrating 4 modules from the main flow into an undocumented scope and becoming the primary front-end owner for ongoing maintenance and feature enhancements.
<!-- Dubai FMP Migration; UAE .com users migrating to Dubai entity; modules: LIQUIDATION, ASSET_CHECK, ADVANCED, ADVANCED_PRO -->

- **Drove data-informed product decisions through A/B testing**, designing and implementing feature experiments to optimize user conversion funnels and validate UX improvements before full rollout.

- **Developed and maintained high-traffic B2C web applications** serving millions of users using React, TypeScript, and Monorepo architecture, supporting both mobile and desktop platforms.

- **Maintained 24/7 service stability through P0 on-call rotations**, resolving critical production issues within 1 hour using log analysis and error monitoring tools.
<!-- Tools: Keter (log analysis), Sensor/神策 (user behavior), Sentry (error monitoring) -->

- **Reduced schema config development time by approximately 50%** by building an AI-assisted workflow (Cursor, Claude Code) — feeding existing config files and Figma screenshots as context to generate new configs and component updates.

- **Consistently delivered stable feature releases** by collaborating with 20+ cross-functional partners (Backend, iOS, Android, QA, PM, UX) across multiple time zones, maintaining quality through rigorous self-testing and code reviews.

#### Electron Team (Nov 2021 - 2022)

- **Improved Webview app loading speed by 30%** by designing and implementing a Webview Pool solution, enabling pre-loading and caching strategies for frequently accessed micro-apps.

- **Reduced user memory consumption** by developing single/multi-process functionality, allowing users to choose between performance and resource efficiency based on their device capabilities.

- **Expanded user accessibility to Arabic-speaking regions** by implementing RTL (Right-to-Left) layout support, enhancing internationalization capabilities for the desktop application.

- **Increased accessibility for visually impaired users** by implementing CVD (Color Vision Deficiency) color scheme options, expanding the product's user demographic.

- **Developed and maintained desktop trading applications** using Electron framework with JavaScript and TypeScript, including feature development, architecture design, and debugging.

- **Contributed to multi-symbol trading and custom layout features** for the futures trading interface, coordinating with cross-functional teams to deliver complex UI components.

---

### International Games System Co., Ltd. (IGS) — Software Engineer
**Feb 2020 - Oct 2021**

- **Accelerated feature development time by 95%** by refactoring the event framework architecture, enabling faster iteration cycles for game event implementations.

- **Reduced application release time by 80%** by optimizing the CI/CD pipeline with Jenkins, automating build and deployment processes and shifting deploying tasks to non-developers.

- **Improved app loading time by approximately 10%** by reducing platform resource dependencies and optimizing the .apk/.ipa file size.

- **Developed and maintained multilingual mobile games** on multiple platforms using Unity (C#), handling game flow control, scene transitions, and animation effects.

- **Reduced rework and maintenance costs** by developing reusable modules and establishing standardized component libraries for cross-project usage.

- **Improved team onboarding efficiency** by writing comprehensive development documentation and new employee orientation guides.

---

### WeHelp Bootcamp — Web Trainee
**Feb 2021 - Aug 2021** (Part-time)

- Acquired web development knowledge and skills in a 26-week frontend engineer bootcamp.
- Developed an e-commerce tourism website (Taipei Day Trip) with minimal guidance in 5 weeks.
- Implemented a reservation system with CMS for merchants, featuring multi-language support and calendar functionality.

---

## Projects

### K-Line Prediction — AI-agent-directed web app
**Live:** [Website](https://k-line-prediction-app.web.app) | [App](https://k-line-prediction-app.web.app/app) | 2026

- **Built and deployed a K-line pattern-matching mini-app predicting short-term ETH/USDT direction** via top-N nearest-neighbor matching on historical candles, delivered through a six-agent pipeline (PM, Architect, Engineer, Reviewer, QA, Designer) directed by one operator — 40+ scoped tickets shipped in 7 days.
- **Published 10 harness rules, each citing the specific bug and ticket that triggered it** — e.g., Content-Alignment Gate (PM holds handoff for user-voice sign-off, K-044), Pre-Design Dry-Run Proof (Architect dry-runs `git show <base>:<file>` before any "API unchanged" claim, K-013), Cross-Page Shared-Component Consistency (QA asserts DOM equivalence across all consuming routes, K-035).
- **Enforced design-as-source-of-truth across the pipeline** — only Designer edits `.pen` design files; Engineer implements against exported JSON + PNG specs; Reviewer runs line-by-line parity between spec and rendered JSX.
- **Delivered end-to-end full-stack** with React + TypeScript + Vite on Firebase Hosting, FastAPI + Python on Cloud Run, Vitest + Playwright + pytest coverage, plus a pre-commit SSOT gate blocking role-table drift across `roles.json` → README → protocol doc.

---

## Education

**National Chiao Tung University** | Master of Science
*Institute of Multimedia Engineering, College of Computer Science* | 2017 - 2019

**National Sun Yat-sen University** | Bachelor of Science
*Department of Mechanical and Electromechanical Engineering* | 2013 - 2017
