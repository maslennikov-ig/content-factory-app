# Shared-host artifact lifecycle — 14 October 2026

Status: DELIVERED. Root operations acceptance PASS; Beads owns task status.
Coordinator `content-factory-next-0qgn.24`, producer `beads_fmcg_kp-qaa3`.

## Observable result

AiDevTeam's canonical deployment now runs artifact maintenance/admission before
building and maintenance after native readiness, under its whole-deployment lock.
Custom/manual deployments must use the documented prepare/finish contract.
Three latest distinct rollback images, all container references and three
explicit owner-approved reserve pins survive. Only obsolete exact names in
`aidevteam-rollback` are removed, without force. Current application images,
containers, volumes, live configuration, Caddy and asset banks are preserved.

Unused default-builder cache older than24h is pruned toward4GB with1GB reserved;
fresh/in-use cache remains. Capacity is measured on DockerRootDir after cleanup.
Less than16GB free or100,000 free inodes refuses a new build before tagging it.
Unknown identity/capacity, missing pins, active build or failed native readiness
also refuse maintenance. Prepare preserves the current healthy app as a stable
rollback tag; finish waits for startup readiness before deleting anything.
No new service/scheduler, Docker daemon change or application rebuild is added.

## Verification and delivery

AiDevTeam source `2283eaae5cfdfcdfec4e0e4aa5d8dbcad8984dc6` committed, pushed and
fast-forwarded to main after fresh remote checks; exact operations files installed
by a guarded source-only host fast-forward. Frontend, package/lock and compose
inputs remain byte-identical to accepted application source3153a34a. Its accepted
type/build proof is reused; no new frontend build or new application CI claimed.
The live AiDevTeam image remains84520a37; CF remains0e8f25e5fe9f/911a9b6a.

Focused producer acceptance:22 Python behavior tests, no skips; bash syntax,
Python compilation and whitespace PASS. Tests include12 simulated accepted
deployments, low bytes/inodes, pin/current/stopped-reference preservation,
retarget/config races, timezone normalization, startup wait, build/plugin
detection, unsupported builder and dry-run. Existing CF capacity/retention
regression:2 Jest suites/101 tests, no skips. No full application suite rerun.

The first read-only live preview refused Docker29's offset/nanosecond timestamp
before any deletion. UTC normalization and a regression corrected that boundary;
the original refusal receipt is retained. Corrected preview chose exactly two
obsolete tags. Actual maintenance removed `seo-20261012-font-fallback-before`
and `seo-20261012-interaction-before`; six required rollback/reserve images remain.
Available space rose from~9.24GB to~17.82GB. The final installed helper's check,
prepare dry-run and actual finish PASS; its source/policy hashes match the commit.

All22 container identities/configurations,20 volumes, six live file hashes and
foreign tagged images preserved. CF readiness/main queue/login/source and
AiDevTeam health200; the latter reports database healthy. No restart, deployment
switch, restored backup, DB mutation, model/provider call or real-user message.
The12 unrelated modified producer files survived integration byte-for-byte.
Owned temporary host files and isolated worktree removed; branch/proof retained.

`evidence/root-acceptance.actual.json` binds source, installed helper, runtime,
maintenance, focused checks and cleanup. Raw host/WIP receipts remain private.

## Limits and continuation

This is a producer lifecycle and admission guard, not a filesystem quota or a
hard cap on fresh/in-use cache. Custom builds must use the documented lock and
hooks. Repeated deployment behavior was simulated; no unnecessary real app
build was used as QA. CF's existing measured pull and verified rollback gates
are unchanged. Original epics, actual owner Telegram/client acceptance, Skool,
legal/pricing/finance/30-day/offsite/ChatGPT/research defers are untouched.
No continuous epic goal or next stage is running; resume the owner testing guide.

docs-reviewed: updated - producer guard/pins/manual contract, shared-host runbook,
stage evidence and current navigation recorded; existing producer handoff WIP preserved.
graph-reviewed: used - `graphify query retain-host-artifacts --graph graphify-out/graph.json`;
CF runtime symbols unchanged; exact producer files inspected, its graph unavailable.
