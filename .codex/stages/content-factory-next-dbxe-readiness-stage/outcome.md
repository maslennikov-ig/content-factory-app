# Worker readiness accepted locally — 9 October 2026

Selected scope: Beads `content-factory-next-dbxe.7` only. Root launched one
visible executor, reviewed its code/fixture and accepted the result with one
affected acceptance set. Beads owns current status; the epic remains open and
task8 retains its original full release gate. No automatic next stage or release.

## Result

The native health command requires API liveness and private orchestrator
readiness. `/health/status` returns generic200 only if every configured worker
and required current-identity poller is available; otherwise generic503. Stopping
the entire worker process makes the endpoint unavailable and health refuses.
An idle queue with no in-flight tasks remains ready.

Readiness reuses registered options, actual workers and the existing Temporal
client. Local lifecycle is checked before and after the shared metadata batch;
two-second budget, four concurrent reads, five-second cache, 120-second poller
recency. Old process identities cannot mask a restarted worker. No workflow,
activity, provider placement, schema or package/lock contract changes.

Changed application files: `apps/orchestrator/src/worker-readiness.service.ts`,
`health.controller.ts`, `app.module.ts`; `Dockerfile` and
`var/docker/healthcheck.sh`. Tests and operator guide:
[worker-readiness.md](../../../docs/operations/worker-readiness.md).

## Root acceptance

- Three affected Jest suites, **158 tests, zero skips**, exit0:
  readiness, existing backend runtime-monitor readiness, and Temporal signatures.
- Current scoped Nest compilation, exit0, reused with verified **410 source/config
  inputs and 1197 dist files**. Node22.23.2/pnpm10.6.1; fresh alias-transformed
  orchestrator output in this stage, no frontend/backend/full release build.
- Real native derivative/image + isolated Temporal/PostgreSQL/Redis PASS.
  Every copied compiled file and health script matches; inherited Temporal
  client/worker1.15.0/core3.2.3 matches installed versions.
- All **32 provider queues plus main** and 34 required task-type pollers present.
  Native memory and swap remain **1792 MiB**, no host ports.
- Healthy idle: API200, readiness200, actual image health exit0 (81ms).
- Owned worker stopped: **API200**, readiness connection refused, actual image
  health **exit7** (83ms); queued safe workflow RUNNING, no activity completion.
- Owned worker restarted with new PID/current identities: readiness200 and actual
  health exit0 (82ms); queued missing-integration workflow COMPLETED with exactly
  one read-only activity, result false. No provider write is inferred.
- Five owned containers, the internal network and candidate image removed.
  Foreign container/network/image inventories preserved; no owned containers left.
- Old workflows/activities/Temporal registration match baseline. All 30 original
  epic/child criteria are preserved. Documentation/process/diff results are in
  [root-acceptance.actual.json](root-acceptance.actual.json).

Candidate image ID:
`sha256:20768ee17ac5bd7d3c302d03638a2fb0454746907d32144e94f67f609a37fd00`.
Compiled tree SHA256:
`a19df059abf57a931544d7c0c689c20579b5fa9a8ee6189ab058c7d64e19c67d`.
Root raw native proof: `root-native-readiness.actual.json`; affected log:
`affected-acceptance.local.log`; build manifest: `build-manifest.local.json`.
Worker delivery/raw diagnostics are preserved; [coordination.md](coordination.md)
records immediate child acceptance and safe-only cleanup.

## Boundaries and continuation

This is a source-bound local derivative, with the inherited backend providing
API liveness. It is not the next full release image or production verification.
No push, registry publication, deploy, credential wiring, provider/model/mail
call, global monitoring change, production fault injection or backup restoration.
The running service was not changed. Docker interval30s/startup180s/retries5 stay;
the final Docker `unhealthy` state follows those thresholds, while the tested
health command refuses immediately when invoked after worker stop.

Two failed build diagnostics remain explicit: first2048MiB scoped tsc heap OOM;
then Nest absolute-path rejection before compilation. Correct relative-path
scoped Nest build passed; no failed attempt counts as passing evidence.

Recommended next bounded task: `content-factory-next-dbxe.10`, preserve concurrent
manual edits during adaptation rerender with atomic comparisons on the exact
read inputs. It remains unselected/open. Root can launch the next executor and
collect its report in this chat when the owner selects that stage. Existing
epic/task8 and all SaaS/client/legal/research defers remain intact.
