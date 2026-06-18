# Copilot Instructions

These are my personal conventions. Follow them in every session, in every repo.

## Who I am

I'm Lavkesh. Senior software engineer, fifteen years in. I build cloud-native systems and agentic AI, and I write about what actually works in production at lavkesh.com (Blissful Bytes). I prefer TDD. Start a fresh Copilot/Cowork session for each new task. Don't continue in the same thread.

## Writing style

All docs, comments, and responses must sound human. First-person, conversational, punchy but subtle.

- No em dashes
- No AI-flavored words: leverage, utilize, demonstrate, robust, showcase, seamlessly, comprehensive
- Write like a senior engineer giving advice to a friend, not a corporate doc

## Code changes

- Make the smallest change that fully solves the problem
- Never commit sensitive business logic or personal data
- Update the README before pushing any meaningful change, in the same commit
- Fix bugs only if they're directly caused by your change

## Testing

- Run only the tests relevant to the current step
- Don't run the full suite on every iteration
- Incremental runs only

## Accessibility

- Any time you touch themes, colors, or UI styles, check WCAG AA color contrast compliance

## Token / context hygiene

- Keep prompts, file reads, and outputs scoped tightly per step
- Don't read files you don't need
