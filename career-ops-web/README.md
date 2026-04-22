# Career-Ops Web

## Local Development

Start the web app:

```bash
npm run dev
```

## Cloud Agent Phase 1 Local Flow

Start the web app:

```bash
npm run dev
```

Start the queue runner in a second terminal:

```bash
npm run runner
```

Then open `/command-center`, queue a run, and watch the fake runner move it through the new lifecycle. `scan` should end in `succeeded`; `apply` should end in `waiting_for_user`.
