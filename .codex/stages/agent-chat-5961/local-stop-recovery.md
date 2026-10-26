# Cold Stop recovery — 25 October 2026

> Historical evidence. The Qwen runtime and local research adapter were removed
> at the owner's request by o260. Do not run the old restart instructions.
> Current runtime: [production API preview](local-api-restore.md).

Task: `content-factory-next-2koa`. Local-only follow-up in
`codex/local-real-model-20261025`, based on7adeee7b451f.

Verified diagnostic: <http://localhost:4316/agents/ab640164-aa0a-4a54-bd76-4234a5d44959>.
The earlier completed coffee case and the original4296 conversation are retained.
Runtime/restart instructions remain in [local model preview](local-real-model.md).

## Cause and implementation

After the earlier acknowledged resume failure, the native workflow checkpoint
and driver were absent. Its persisted owner lease was not live, but thread
metadata said `assistantExecution.state=stopping` and the temporary Redis receipt
said running. Cold Stop had no driver or suspended checkpoint left to emit the
terminal callback, yet returned stopped:true. A regression reproduced this
exact running-after-positive-Stop symptom before implementation.

`AgentThreadsService.stopTurn` now requires cold native settlement after its
existing saved-response proof and HTTP-owner drain. `MastraService` checks the
exact resource/thread/run/logical-request identity and all known lineage runs.
A live registry entry/lease or an uncanceled stored checkpoint prevents orphan
settlement. Existing valid terminal outcomes stay unchanged.

Only when no driver remains, the native Memory store's public atomic metadata
update changes the exact stopped request to settled/interrupted. The transaction
rechecks ownership and Stop intent, preserving successor requests, unrelated
metadata, messages, tool receipts and saved content. Failed persistence or a
changed owner cannot receive a positive terminal Stop acknowledgement. The
durable marker remains authoritative after a temporary receipt expires.

This uses existing Mastra PostgreSQL/Redis and public APIs. No schema, dependency,
provider, model configuration, Temporal contract or frontend implementation changed.

## Verification

Root-owned final affected acceptance:

```sh
pnpm exec jest --runInBand --no-coverage \
  tests/agent-native-stop-orphan.test.cjs \
  tests/agent-native-stop-identity.test.cjs \
  tests/agent-native-stop-settlement.test.cjs \
  tests/agent-native-stop-tail.test.cjs
pnpm exec tsc --noEmit --incremental false -p apps/backend/tsconfig.build.json
git diff --check
```

Four suites/16 tests PASS; backend types and diff PASS. The new actual PG/Redis
regression covers missing checkpoint/owner, Redis expiry, repeated Stop, completed
outcome preservation, missing saved response, failed terminal storage, a live
foreign driver lease and a successor arriving before the atomic update. Existing
suites retain exact identity, terminal-write/tail drain, swallowed persistence
failure, parked question/approval, pre-start and internal-reader cancellation cases.
Controlled provider abort/error logs in these negative tests are expected.
No full repository build/suite or release gate was run for this bounded repair.

Actual retained diagnostic on the real-model stand:

- Stop returned HTTP201 and original request59fac473-654f-4784-bf22-a81f9ac8b08f.
- History became settled/interrupted, native rund25aee85-ae53-4a34-81de-19175517f36e,
  pending=[]; message array remained equal to the pre-fix snapshot.
- Actual SIGKILL of only the identity-verified owned3516 backend, followed by
  recreation: history still settled/interrupted. No answer was resent.
- Browser reload: composer enabled, no Stop/unknown-state controls. Screenshot
  retained privately. Repeated Stop kept the same identity and terminal outcome.
- The local model gateway audit remained byte-identical: zero new model calls,
  including zero paid calls. The deterministic regression model was never invoked
  in the orphan/negative cases either. Saved posts remain DRAFT.

Private exact receipts/logs are under
`/home/me/.local/state/content-factory-next/local-real-model-20261025/stop-fix`.
`local-stop-recovery-proof.json` contains only non-secret result pointers/hashes.
The backend's `/public/source/version` identifies the final local source archive.

docs-reviewed: updated — Stop outcome, current handoff/navigation and prior limit.
graph-reviewed: no-change-needed — existing known entrypoints only; root report
is stale dd67538 orientation, with current source inspected directly. No graph
refresh or external extraction. GitHub/Linear publication stays server-managed;
no local publisher trigger is run.

## Remaining boundaries

Only the owned candidate3516 backend was restarted; original3496/4296, candidate
frontend4316/gateway8336/GPU8335 and adjacent workloads were retained. Original
chat and completed coffee history, foreign root HEAD/status and file hashes,
service identities and saved local drafts were checked separately from Stop.
All captured application process identities remained exact. Two unattributed
PID-less loopback listeners55471/55524 were absent in the final snapshot; their
ownership/cause is unknown. All named application/database service listeners
remained available. No unidentified listener was recreated or service stopped.

The existing local14B model's editorial limitations remain: repeated questions,
literal null title, dropped date and unsupported generic wording. External search,
publication and hosted-provider quality remain unqualified. No paid call, push,
merge, deployment or production action occurred.
