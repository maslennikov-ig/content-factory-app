# Telegram editorial follow-up — production acceptance

Task: `content-factory-next-g4qy`. Owner authorized push, merge and production
deployment, then clarified that native agents must propose task-specific sizes
instead of inheriting manual channel numeric defaults. Changes apply to the
current material by default; saving channel defaults requires a separate choice.

Private source `7c718ffc6754691d85d695899b0aaf30475c5e8a`, merged through
[PR #1223](https://github.com/maslennikov-ig/content-factory-next/pull/1223) and
[fixture PR #1224](https://github.com/maslennikov-ig/content-factory-next/pull/1224).
Public source `9c88a65a368ba5408db490e975aeb12c6dffa60e`, runtime `9c88a65a368b`.
Registry `ghcr.io/maslennikov-ig/content-factory-next`, digest
`sha256:239d55c7daf5e28aa3635aa136d6b8542a808c614db402267f5be875d739067c`.
Rollback `0bdd01349db6`; no schema or saved channel-default changes.

## Diagnosis

Read the owner-linked production chat through Mastra's native read methods,
with initialization disabled and a read-only DB session. The conductor knew
the configured range but did not propose overrides. A metadata title existed
without a published headline. Its instruction explicitly prohibited revisions
after advisory findings. A date warning also needed evidence assessment: the
original primary announcement supports the preview date despite vague relative
wording in a later article. No live chat, settings or post was changed.

## Delivered behavior

The shared Telegram policy reaches opening, body and review. The conductor
proposes 2–3 task-specific length options before generation, independent of the
manual channel numeric default. The existing card selects or edits actual values;
channel defaults are a secondary explicit choice. Native records require a size
proposal before spending; accepted choices persist per material and remain settled.
The existing review can correct generated Telegram text before save without an
additional model call. Malformed/unavailable revisions preserve the original;
post count, metadata, URL set and source bindings remain, and visible length /
copy findings are recomputed. Applied corrections persist in native results and
artifact history, separately from remaining findings. Saved-post editing and
publication approvals are unchanged. Review output can be longer and cost more;
there is no promise of equal token cost or perfect model adherence.

Rules and research basis: [editorial guide](../../../docs/operations/telegram-editorial-quality.md).
Design: [completion plan](../../../docs/superpowers/plans/2026-11-02-telegram-editorial-completion.md).

## Release verification

- Node 22.23.2 / pnpm 10.6.1; canonical `record-suite-receipt.sh` passed on the
  final private source: Jest 809 suites / 13,942 tests passed (17 suites / 162
  tests skipped), Node 170 passed / 4 skipped, Python 50 passed.
- `pnpm run build`, frontend/backend/orchestrator types, branding, docs, process
  verification and diff checks passed. Build/type evidence is from `dd26bff0a1f3`;
  the subsequent diff to the released source contains only test fixtures/merge
  ancestry, with no app/library/dependency/build input changes.
- Exact public source [Build CI](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41457143617)
  passed all ten jobs, including complete ordinary/+400-day populations and the
  required Jest/Node/Python aggregate. [Code Quality](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41457143835)
  passed. Private skipped jobs are not used as acceptance.
- Native scenario fixtures now explicitly propose and accept a size before
  generation, retaining provenance/search/call-budget assertions. No resolver
  bypass or new paid call was introduced to make the tests pass.
- Actual length-card browser harness passed at 390/1440 px: keyboard selection,
  numeric edits, no automatic submission, exact callback values, settled
  history, secondary channel fallback and busy controls. This is component
  evidence, not authenticated production E2E.
- Public-tree image build, offline nginx config and offline commands `--help`
  passed; registry weight/capacity gates passed and the pulled digest matched.
- Canonical host switch passed. App healthy with zero restarts; backend,
  orchestrator and frontend online with zero restarts; worker readiness `ok`.
- Pinned Prisma 6.5.0 engine reports `diffExitCode:0`, `sqlLines:0`,
  `schemaApplied:false` before/after switch. No schema mutation occurred.
- Read-only before/after comparisons preserve 49 threads, 385 messages, workflow
  states, 1,266 usage rows and settings. Foreign container IDs/images/mounts,
  volume inventory and app mounts match. Mount arrays are sorted for comparison
  because Docker returned the same Caddy mounts in a different order.
- Public API, login and source endpoints return 200. Version is the final public
  SHA; downloaded source archive matches both manifest length and SHA-256.
- Production public login browser passed at 390/1440 px: controls visible, no
  horizontal overflow or page/console errors. No account login or form submission.
- Canonical retention kept runtime `9c88a65a368b` and verified rollback
  `0bdd01349db6`; removed two older own image tags and four excess own config
  backups. Post-retention runtime/data/source checks passed again. Host free
  space is 22.85 GB (21.29 GiB); no foreign images, volumes or workloads changed.

No paid model QA or live publishing was performed. Scripted-model tests and
browser/runtime checks do not prove semantic quality or spontaneous behavior
with a real provider. Existing deferred real-provider qualification remains
separate; no actual Telegram rendering or send is claimed.

Docs-reviewed: updated — common policy, research basis, plan, handoff/index.
Graph-reviewed: blocked — no local/sibling graph available; exact owning paths
were taken from the project index and current source.
Private evidence: `/home/me/.local/state/content-factory-next/editorial-agent-length-20261102/`.
This contains read-only production fingerprints and is not published.
Cleanup: isolated component preview and both named browsers stopped; task-owned
PG/Redis smoke containers and network removed. Shared localhost4337, canonical
checkouts, prior release build/public trees, branch refs and unrelated dirty
`.codex/orchestrator.toml` are preserved. Existing dependency environments and
pinned schema tools are not task-owned disposable resources.
GitHub sync: managed server only; no native/local publisher triggered.

## Task-specific length follow-up

Owner clarified that numeric channel defaults primarily serve manual generation.
Native agent requests now require a concrete proposal (2–3 tailored options,
exact requested range, or explicitly delegated auto) before generation. Options
are validated against provider limits, not the channel ceiling. One editable
card handles choice and other settings; no duplicate preliminary question.
Approval/recovery/history use actual accepted values, with legacy snapshot and
manual/MCP compatibility. UI and server regression tests cover choice, custom
range, recovery, platform rejection and no channel mutation. Frontend typecheck
passed. Final release evidence supersedes intermediate focused counts above.

Child streams: UI code accepted after root diff review and 15 focused component
tests; bounded independent correctness review found no actionable defects.
Browser and fixture streams accepted after scoped evidence review; root owns final
suite, Git delivery, image switch and runtime/data acceptance. Child cleanup is
complete; evidence is retained in the private directory above.
