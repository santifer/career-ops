# Process All History — 2026-05-20

Reconstructed from /tmp/process-all-*.log + /tmp/batch-only-*.log + pipeline-process-state.json.

## Summary

- **Runs found in /tmp logs:** 4
- **Runs in state.json (recent):** 2
- **Pipeline still pending:** 1310
- **Scan history total (all-time URLs ingested):** 4409
- **Runs that HIT the per-session cap:** 1 of 4
- **Total URLs advanced to batch (sum across all runs):** 102
- **Total URLs processed by triage (sum across all runs):** 121

## Per-run detail

| Started | Type | Cap (limit/daily) | Adv | Skip | Dead | Proc | Cap hit? | Job ID |
|---------|------|-------------------|-----|------|------|------|----------|--------|
| 2026-05-19T23:26:36.145Z | process-all | 50/300 (defaulted) | 38 | 4 | 0 | 42 | no | proc-mpd9i8fg-4ec1a7 |
| 2026-05-20T00:16:52.152Z | process-all | 50/300 (defaulted) | 28 | 1 | 0 | 29 | no | proc-mpdbavle-0c0d9a |
| 2026-05-20T04:35:10.933Z | batch-only | 50/200 (defaulted) | 0 | 0 | 0 | 0 | no | batch-mpdkj2it-c8116e |
| 2026-05-20T04:48:39.223Z | process-all | 50/300 (defaulted) | 36 | 14 | 0 | 50 | ⚠ YES | proc-mpdl0e77-5dad79 |

## Recommended next steps

- **Pipeline has 1310 pending URLs.** Run Process All once — with the 2026-05-20 cap fix, triage will now process all of them in a single pass (per the cost-confirmation contract). Estimate cost via the dashboard Process All modal preview before confirming.
- **1 historical run(s) hit the per-session cap.** Those runs left URLs un-triaged in the pipeline. Most are still in pipeline.md and will be picked up on the next Process All. URLs that were dropped from pipeline.md by intermediate dedup/canonicalization are listed in the next section.

## Future cap-hit detection

Per-run telemetry is now recorded in `data/pipeline-process-state.json` under each `proc-*` job:
- `triage_pipeline_before` / `triage_pipeline_after` — pipeline size delta
- `triage_cap` — the effective per-session limit for this run
- `triage_cap_hit` — boolean: did the cap bind throughput?
- `triage_missed_this_run` — URLs left untouched when cap_hit was true

Re-run this report any time after a Process All to audit the run.
