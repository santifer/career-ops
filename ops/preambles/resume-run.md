You are resuming an in-flight yash-resume-pipeline run after a VPS reboot.

URL: $URL
Run ID: $RUN_ID
Last completed phase: $LAST_PHASE
Already-produced artifacts on disk (do NOT regenerate):
$INPUTS_SUMMARY

Resume at phase $NEXT_PHASE. Continue calling
  node yash-resume-pipeline.mjs checkpoint --run-id $RUN_ID --phase <name> --url-hash $URL_HASH --inputs '<json>'
after every subsequent phase.

Start now.
