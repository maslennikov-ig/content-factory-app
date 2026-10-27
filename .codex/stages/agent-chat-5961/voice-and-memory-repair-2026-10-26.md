# First-person voice, full reply locale and native preference-memory repair

Delivered production release: [accepted version and limits](release-voice-2026-10-26.md).
The local-only state below is historical implementation evidence.

Task: `content-factory-next-dv8a`. Branch: `codex/chat-voice-error-20261026`.
Base: private `3e08b39ec492`; production remains public `34d3591b2cc1`.
Local engineering acceptance only; no push, merge, deployment or paid provider calls.

## Diagnosis and change

The owner screenshot showed an unnamed approval, not a completed draft. A read-only
inspection of its exact saved Mastra run found a pending `updateWorkingMemory`
call after task creation. The default Session policy asked for permission, while
the product approval description supported no such native tool. Reload could
therefore only display the same unavailable action. No research or draft was saved.

- The existing native safe-bookkeeping permission policy now includes personal
  preference memory. Explicit category/tool ask and deny rules still win. Native
  storage/schema/resource ownership and every domain approval remain authoritative.
- Memory's existing protected instruction extension replaces its generic command
  to memorize every response with the product's preferences-only policy. No phrase
  classifiers, topic checks, extra memory store or outcome rewrite were added.
- Older saved memory approvals and explicit ask policies get a description of
  their validated native input; invalid/unknown actions remain unconfirmed.
- The old product/team-plural prompt is replaced with first-person singular for
  assistant actions. Quotations and authored text retain their own voice.
- The full trusted interface locale survives native request context and suspension
  alongside legacy ru/en capability labels. Legacy snapshots stay readable.
  Main model replies/task labels use the selected locale; requested article/channel/
  avatar language stays separate. Active UI status copy covers all sixteen locales.
- Existing card copy outside active progress/navigation still has its historical
  ru/en fallback; this change does not claim full sixteen-language UI completion.

## Acceptance

Root-selected Jest set: twelve suites / 372 tests PASS, including actual native
Session/PostgreSQL/Redis continuation and process recreation. Additional affected
MCP identity compatibility: one suite / ten tests PASS. Exact commands/logs and
red-before/green-after proof are retained privately under
`/home/me/.local/state/content-factory-next/chat-voice-error-20261026`.

Backend and frontend `pnpm exec node node_modules/typescript/bin/tsc --project
apps/<role>/tsconfig.json --noEmit --incremental false`: PASS. Matching type evidence
is reused after documentation/comment-only follow-up. No full build/release suite
was requested or claimed. Actual paid model wording/editorial quality was not run.

The native regression exercises successful preference saving, continued answer,
explicit category ask, tool ask/deny, unchanged domain/objective/inbox gates and
foreign-resource rejection. The rendered real approval card shows the saved input
and sends its answer once. Cold/HTTP probes cover old questions/approvals and
exactly one domain write using controlled free test model streams.

## Preservation, cleanup and delivery

The source checkout's eleven existing dirty/untracked files were untouched. The
owner production thread, its messages and suspended snapshot were compared exactly
before/after read-only inspection; no approval/answer/resume was sent. A timed-out
owned read-only inspection process was identified by its exact PID/start/cmdline
and removed; no application/service process was signalled.

Disposable owned test PostgreSQL/Redis containers, volumes and credentials are
removed after acceptance. The accepted review worktree and its branch are retained
as the current editable deliverable; its dependency link reuses existing packages.
Foreign worktrees, databases, services and shared caches remain untouched.

Docs-reviewed: updated — PRODUCT voice rule, harness spec, handoff and index.
Graph-reviewed: used — focused `approvalPreview` lookup borrowed the original
checkout's dd67538d graph read-only, returned no match and disclosed staleness;
current controller/Memory/permission source and installed SDK types were checked.
No graph refresh or external semantic/model backend.

Delivery remains local. The owner chat stays parked on its original historical
approval until an authorized release and the person's answer/continuation; actual
continuation can invoke the normal paid production APIs.

## Authorized release preparation

The owner subsequently authorized push, merge, deployment and green CI. Root
accepted the bounded cold-policy regression stream. Actual native observer GET,
SIGKILL/process recreation and twenty seconds of passive reconnect preserve the
old memory card without a model call or mutation; explicit approval executes
once and a later fresh memory call autoallows. The static auto-release hypothesis
was rejected for this actual flow; no additional runtime policy or queue was added.
The new regression passed separately (one test); final release evidence follows
in the release artifact. The worker created no runtime outside the root-owned
disposable PG/Redis pair; source accepted, test scratch/schema cleanup verified.
