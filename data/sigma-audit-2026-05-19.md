# SIGMA Audit Report — 2026-05-19

**Branch:** sigma/audit-2026-05-19-1301
**Mode:** audit-only
**Findings:** 10 (capped at 10)
**Generated:** 2026-05-19T13:01:56-07:00

## Severity breakdown

| Severity | Count |
|---|---|
| CRIT | 0 |
| HIGH | 3 |
| MED | 7 |
| LOW | 0 |

## Stream breakdown

- **Debug stream:** 2 findings
- **Hardening stream:** 8 findings

## Findings

### dbg-launchd-4ffd1596 — HIGH launchd-runtime-error

- **File:** `data/logs/dashboard-server.err` (line tail)
- **Headline:** recurring error in dashboard-server.err: Error: listen EADDRINUSE: address already in use :::3097

**Evidence:**

```
Error: listen EADDRINUSE: address already in use :::3097
    at Server.setupListenHandle [as _listen2] (node:net:1948:16)
    at listenInCluster (node:net:2005:12)
    at Server.listen (node:net:2110:7)
    at file:///Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs:6437:8
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:661:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
    at emitErrorNT (node:net:1984:8)
Error: listen EADDRINUSE: address already in use :::3097
    at Server.setupListenHandle [as _listen2] (node:net:1948:16)
    at listenInCluster (node:net:2005:12)
    at Server.listen (node:net:2110:7)
    at file:///Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs:6567:8
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:661:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
    at emitErrorNT (node:net:1984:8)
```

### dbg-dash-d20ffb60 — HIGH dashboard-server-error

- **File:** `data/logs/dashboard-server.err` (line tail)
- **Headline:** dashboard-server: 0 5xx + 16 stack lines in past 7d

**Evidence:**

```
stack traces (16):
    at listenInCluster (node:net:2005:12)
    at Server.listen (node:net:2110:7)
    at file:///Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs:6437:8
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:661:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
    at emitErrorNT (node:net:1984:8)
    at Server.setupListenHandle [as _listen2] (node:net:1948:16)
    at listenInCluster (node:net:2005:12)
    at Server.listen (node:net:2110:7)
    at file:///Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs:6567:8
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:661:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
    at emitErrorNT (node:net:1984:8)
```

### hard-tpl-c2e9f139 — HIGH outer-template-unescape

- **File:** `scripts/build-dashboard.mjs` (line 28626,28632)
- **Headline:** build-dashboard.mjs: 2 potential outer-template-unescape site(s)

**Evidence:**

```
L28626: out = out.replace(/\n{3,}/g, '\n\n');
L28632: out = out.replace(/\n{3,}/g, '\n\n');
```

### hard-ld-71693cd2 — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.audit.plist` (line 1)
- **Headline:** com.mitchell.career-ops.audit.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-fb174377 — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.batch.plist` (line 1)
- **Headline:** com.mitchell.career-ops.batch.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-2853eabe — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.bravo-quick-walk.plist` (line 1)
- **Headline:** com.mitchell.career-ops.bravo-quick-walk.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-b742aa5e — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.builder-log.plist` (line 1)
- **Headline:** com.mitchell.career-ops.builder-log.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-3eeee90d — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.career-library.plist` (line 1)
- **Headline:** com.mitchell.career-ops.career-library.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-8dc6a510 — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.community-scan.plist` (line 1)
- **Headline:** com.mitchell.career-ops.community-scan.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```

### hard-ld-81170cc7 — MED launchd-hygiene

- **File:** `scripts/launchd/com.mitchell.career-ops.company-pulse.plist` (line 1)
- **Headline:** com.mitchell.career-ops.company-pulse.plist: 1 hygiene issue(s)

**Evidence:**

```
pinned-version node path (breaks on nvm upgrade)
```
