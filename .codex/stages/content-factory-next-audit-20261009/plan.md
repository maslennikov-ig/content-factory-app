# Content Factory audit — 9 October 2026

Requested outcome: check operational reliability and all repository subsystems for actionable unfinished behavior, legacy paths, risky workarounds and verification gaps; create one Beads implementation epic with bounded issues and a launch prompt for a new chat. This stage audits and records findings; it does not implement the resulting backlog or deploy.

Baseline: private main `5189430f175382d246629a461d62836c8811b241`; last tested source `e2ec588dca449dcbaefe1b2a56ef42bcb2408a6d`; deployed public `cae3cd8340e06058365a9c9adca8194858abbb12`. Confirm actual runtime before claiming current health. Reuse yesterday's suite/build/product evidence only after checking exact relevant inputs.

Scope and ownership:
- Root: operational health/readiness/recovery, build/test/dependency/release tooling, inventory, deduplication against Beads, acceptance, final report and new-chat prompt.
- Backend stream: backend/auth/API/agent/persistence shared server code, tenant and data safety, lifecycle/unfinished behavior. Read-only source; owns `backend-review.md` only.
- Frontend stream: frontend/shared React/helpers/routes, unfinished or unreachable behavior, legacy branches and UX failure states. Read-only source; owns `frontend-review.md` only.
- Providers stream: orchestrator/workflows/provider integrations/commands/SDK/extension, legacy callers/contracts and failure handling. Read-only source; owns `providers-review.md` only.

Concrete delegation benefit: independent large source domains reduce audit latency and isolate code context. Three scoped reviewers inspect code once; root verifies actionable candidates without an additional reviewer layer.

Method:
1. Read current instructions/handoff/tracker and source inventory. Use the latest existing local graph for orientation; confirm exact source in this checkout. Never infer dead code merely from a graph miss or a TODO.
2. Inspect domain entry points, lifecycle and dangerous patterns; retain findings only with reachable caller/trigger, impact, exact file/line evidence and bounded acceptance. Separate confirmed faults, unknown proof and safe compatibility code.
3. Check live application read-only. Demonstrate process/queue recovery only with isolated disposable owned resources, no live provider/model/customer actions or production fault injection. Record any unexecutable proof as UNKNOWN.
4. Reuse matching suite/build/CI evidence; perform focused probes for new audit findings. Do not rerun expensive full acceptance just for report changes.
5. Create one Beads epic and prioritized implementation tasks, linking existing issues rather than duplicating or closing original unmet requirements. Preserve owner defers and original epic.
6. Save report, evidence, handoff and a concise prompt for a new Codex chat. Verify artifact links, task readback and absence of source/runtime collateral changes.

Boundaries: no schema/data mutation, backup restoration, global collector changes, foreign cleanup, real channel connection/publication, customer messaging, paid calls, push/merge/deploy. Isolated probes must not access production credentials or live queues. Preserve unrelated untracked artifacts and other owners' running local containers.

Operational probe preflight: create a uniquely named internal Docker network and fresh tmpfs PostgreSQL/Redis/Temporal/app containers, using the existing current public image with its accepted source manifest. All URLs/keys are disposable synthetic configuration. No published ports or shared mounts. Verify network internal and resource labels before running native app/workers. Initialize only the disposable blank database (no backup import). A worker crash is confined to this app; task queues belong to its isolated Temporal. Cleanup in `finally` removes only the exact created labeled container/network IDs. Compare pre/post unrelated container identities. If the native stack cannot start, retain diagnostics and report UNKNOWN instead of substituting a stub for whole-app recovery.

Acceptance: source-domain coverage with explicit limitations; current runtime identity and health evidence; honest operational recovery result; deduplicated Beads epic/tasks with observable acceptance; restartable new-chat prompt. A broad audit cannot prove absence of all defects.
