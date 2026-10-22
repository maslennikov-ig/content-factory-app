# Native Mastra completion repair

Boundary: local implementation and QA only. The user explicitly authorized a scoped read of existing generation/search credentials from the server and saving them locally. That read is complete; private local files and re-encrypted local settings hold the credentials. No production mutation, push or deploy. Real local provider calls and synthetic data are authorized. Secrets and live account identifiers stay outside Git.
Baseline: e74e059ea104593d2fac831eb989714a5b151263; branch codex/on0i-native-repair-20261021. Original scope: on0i.1–.7 / A1–A31, retained in docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Independent review R1–R6: ../content-factory-next-on0i-review-20261021/review.md.

1. Native contract proof: Session signal/send/resume and subscribed raw stream, native delayed availability recovery, native storage intent/fencing. Inspect exact installed 1.78 contracts; no private SDK patches.
2. Parallel implementation: retry_models owns native model/retry factories and shared retry helper; durable_receipts owns tool intent/receipts; availability_recovery owns new native wait/recovery modules. retry_models also owns native Session + authenticated HTTP/UI; availability_recovery owns MastraService integration. Root owns accounting integration, actual browser proof, shared decisions and final acceptance.
3. Integrate actual web send, typed durable queue/steering, Stop, observer reconnect and startup recovery. Keep permissions, consent, source/media retrieval, original history/IDs and Temporal domain contracts.
4. Local PostgreSQL/Redis lifecycle scenarios: disconnect vs Stop, new observer/process, all models down then restored, kill/restart during waiting or side effects, stale driver/duplicate callback, queued request ordering and tenant isolation. Reuse actual native SDK with fake provider faults.
5. Real local configured models/search: direct no-search answer; fresh topic research and saved draft; reference request; saved research continuation/adaptation; questions/approval; partial or unavailable sources. Record provider calls, saved outputs, citations/gaps, whole-run usage and semantic review. No real social publishing or original user objects.
6. One final root acceptance: backend/frontend/orchestrator typechecks, build, all three halves of pnpm test, docs, branding, process, diff; focused browser scenarios with screenshots/readback. Repair test evidence map and docs; update canonical task truth through Beads. Local commits only.

## Premortem

Verdict GO WITH CONDITIONS: native API feasibility probes precede coupled integration. Changes are reversible in the isolated branch; test objects and local resources are owned and separately removable.

| Risk / evidence | Detection | Mitigation / owner |
|---|---|---|
| Live Stop only drops HTTP (confirmed R1) | Rendered active chat + delayed tool and usage | Server-native abort with acknowledged state; root |
| Routing multiplies attempts (confirmed R2) | Combined selected-model fault injection and exact ledger count | One native retry/fallback owner; retry_models |
| Exhausted failures lose checkpoint (confirmed R3) | Real process kill/restart during provider outage | Supported native wait/workflow before terminal failure; availability_recovery + root |
| Domain effect succeeds but receipt lost (confirmed R4) | Lost-ack/read-failure/crash gap + native PG claim | Durable native intent; uncertain state prevents blind replay; durable_receipts |
| Browser queue or observer disappears (confirmed R5/R6) | Reload/new-service/native subscription and multiple chats | Native typed signals, persisted queue/cache and Session controls; root |
| Session mode/model bypasses metering or widens permission (plausible SDK integration) | Real next-turn selected model, classifier/judge/subagent accounting and deny/consent | Trusted contexts and metered dynamic model resolution; root + retry_models |
| Executor invents APIs or reports fixture coverage as full (confirmed prior report gap) | Installed .d.ts/runtime probes, source-bound final receipts | Actual consumer/scenario evidence, truthful limits; root |

Recovery: stop owned local execution through native abort, keep unresolved effect intents, restore prior source by branch/revert only after preserving unrelated work; no production rollback is part of this stage. Native schema changes stay in disposable local stores until separately delivered.
