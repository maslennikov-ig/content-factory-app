# dbxe.15 — execution-time automation disablement

Selected by the owner on 10 October 2026. Baseline `60f4c6f615c8d5abeb49ef02ff6eaf000872702c`.
One bounded local stage. Beads remains the task authority; the epic and dbxe.8 release gate stay open.

## Original criterion (verbatim)

After scheduling then disabling plug/channel/provider switch, wake invokes zero provider operations and records a safe skip. Enabled action still runs. Gate at execution and provider-specific switch; preserve old Temporal commands/contracts and never auto-cancel unrelated histories.

## Specification

- Recheck the freshly loaded global plug's activation, its channel's disabled/deleted state, and the current provider capability before parsing fields or dispatching. A removed plug, channel, provider or capability is a safe skip.
- For internal actions, check both freshly loaded source and destination channels and the current internal capability before dispatching. Preserve the existing organization-scoped lookup.
- Keep provider-specific switches in the provider. X's analytics-dependent global repost/reply actions must check `DISABLE_X_ANALYTICS` before token parsing, SDK loading or API calls; recheck before the write after their existing delay. Keep existing truthiness and enabled behavior. Ordinary internal reposts do not depend on this analytics switch.
- Record a fixed `automation_skipped` event with kind and reason only. No post/channel/organization IDs, credentials, field content or provider error body.
- A global skip returns `true`, ending that plug's remaining cached repetitions. Internal actions preserve their void result. Keep existing enabled threshold/retry behavior.
- Preserve all V101–V106 workflow sources, old activity sources, arguments, returns and baselines. The gate belongs behind the existing activity in the service; do not cancel, rewrite or migrate histories. This checks state at execution, not cancellation of an already sent remote request.
- No schema, new journal/UI, locks, scheduling refactor, dependency update or new generic provider-switch framework.

Temporal's scheduled activity type/arguments and completion are history events ([official event reference](https://docs.temporal.io/workflow-execution/event)); this stage changes the service's execution predicate without changing workflow commands or activity contracts.

## Ownership and accepted child delivery

Root owns service/provider implementation, focused regression tests, one final acceptance, docs and local delivery.
One read-only executor, `automation_contract_map`, independently mapped legacy callers while root inspected the execution path. Its completed delivery is accepted: all six exported workflows use the same old activities; global true removes later entries; internal result stays void. Existing callers omit `currentRun`, so skips must not rely on it. No child writes, resources or cleanup remain; no extra reviewer is added.

## Implementation and proof

1. Preserve all 30 original Beads criteria and legacy source hashes; reproduce the disabled-action failure with focused tests.
2. Add service guards and X-local switch guards, keeping enabled behavior.
3. One root acceptance: global/internal disabled and enabled cases, actual cached-workflow function fixtures, real disposable PostgreSQL row changes, X SDK/API counters, legacy byte/signature checks, affected TypeScript projects, docs and diff. Workflow fixtures are not a native Temporal replay or live-provider proof.
4. Close only dbxe.15 on matching evidence, make a scoped local commit, update handoff/index and stop for the owner's next selection.

No full release suite/build, source push, deployment, live accounts, model/provider calls or shared-host mutation. PostgreSQL, if used, is an exact-owned disposable loopback fixture; preserve every pre-existing container and remove only that fixture. Do not touch historical untracked evidence.

## Technical premortem

Verdict: GO. Reversible through a local code revert and exact fixture cleanup; no production state is changed.
Blast radius: current row -> capability lookup -> provider dispatch; X switch -> analytics-dependent provider methods. Old workflow/activity contracts remain unchanged.

| Risk | Evidence | Preflight / disposition |
| --- | --- | --- |
| A disabled row still invokes a side effect | Confirmed: the service reloads rows without checking state | Failing reproducer; fresh-state guard before dispatch; provider counters must stay zero |
| Cached legacy jobs repeat a skipped action | Confirmed: V101–V106 remove later entries only on truthy result and omit currentRun | Skip returns true directly; exercise unchanged cached workflows and legacy guards |
| Provider metadata was captured before switch change | Confirmed: X decorator reads environment at module load | Provider-local execution guard before SDK/API plus before delayed write |
| Enabled actions or internal return semantics regress | Plausible | Positive cases assert exact arguments, provider binding, threshold results and void internal return |
| Skip diagnostics expose secrets or user text | Plausible | Fixed event/reason only; adversarial fixture data and log assertions |
| Executor edits frozen files or expands into a release | ExecutorError, plausible | Read-only bounded child accepted; root checks legacy hashes, source diff and task scope |
| Disposable DB cleanup harms unrelated containers | Plausible | Owner label/ID, before/after inventory and exact finally cleanup; no broad prune |

## Navigation review

graph-reviewed: focused local `.processPlugs()` / `.getSocialIntegration()` lookup used stale graph `46ec4108` for orientation; exact service, manager, repository, provider and six callers verified in the current tree. No graph refresh, external extraction or git hooks.
