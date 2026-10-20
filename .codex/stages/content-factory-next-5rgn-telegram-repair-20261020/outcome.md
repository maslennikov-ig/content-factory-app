# Telegram chain repair — content-factory-next-5rgn

Status: implementation in progress. Owner requests complete pipeline repair,
restoration of their avatar/pre-QA settings, two real reruns and resulting posts,
with original versions preserved. Plan:
`docs/superpowers/plans/2026-10-20-telegram-adaptation-chain-repair.md`.

## Authority and isolation

The current owner instruction authorizes the product correction and actual paid
reruns required to demonstrate it. Social publication, new account connections,
credential changes and unrelated cleanup are outside this request.
Source worktree: `/home/me/code/content-factory-next-worktrees/telegram-pipeline-repair-20261020`,
branch `codex/telegram-pipeline-repair-20261020`, baseline `ec3839123`.
The starting checkout's unrelated handoff/index changes remain untouched.
Root owns integration, acceptance and delivery. Parallel source and generation
streams use disjoint files; no child owns a release decision.

## Completed live configuration correction

Read-only audit established that the channel was assigned a QA avatar and note.
The private pre-QA snapshot from 17 October supplies its actual former writing
profile. Root backed up current configuration, immediately re-read and checked
it was unchanged, restored the historical writing settings via authenticated
`PUT /integrations/:id/writing-profile`, and verified the result through GET.
The intended author avatar, original useful-content note, end links and automatic
format are restored; legacy emoji density was normalized by the product reader.
Safe existing reserve mode is retained; restoring old autopilot mode is not
authorized by this task. Original pieces/adaptations/posts are privately backed
up and still drafts. No avatar record or content was deleted.

Private before/after, original requests and exact originals are in
`/tmp/cf-adaptation-audit-20261020` (0700). Do not copy these into Git/public source.

## Streams and acceptance

- Research provenance: gpt-6.1-sol/high, benefit `parallel_latency` and isolated
  intake/source context. Delivered and accepted for integration after root
  inspected the source handoff and focused evidence (9 suites/151 tests;
  final 2 suites/19 tests). Full release acceptance remains pending. Private
  ownership, durable quote/source pairing and uncertain-write refusal are
  covered. Safe-only cleanup: no child runtime resources; task logs retained.
  [Stream evidence](research-stream.md).
- Adaptation completeness: gpt-6.1-sol/max, benefit `specialist_capability` and
  isolated generator/context edits. Delivered and accepted for integration:
  7 focused suites/183 tests, 32 native context-builder tests and backend types
  pass. Includes complete opening/body, bounded review/repair, deterministic
  provider/caption/channel length and a real model-token-budget regression.
  Root release/live acceptance remains pending. Safe-only cleanup: no child
  live resources; task logs retained.
- Root saved-result readback: actual persisted adaptation/core/goal exposed as
  explicitly untrusted data with assessmentRequired; long/missing text directs
  a storage read. Conductor compares actual saved text with original objective.
  Focused regression: 3/3 pass; affected adapter/conductor set: 149/149 pass.
- Independent correctness review: gpt-6.1-sol/max, benefit `context_isolation`.
  Root accepted the [review](review.md) and verified fixes to all three actual
  findings: person-selection bypass, composed text length and short-avatar token
  ceiling. Research correction red2 -> green4 suites/82 tests. No remaining
  release blocker in the reviewed scope; semantic quality remains a live gate.
  Reviewer made no runtime resources or code edits; review evidence retained.

Offline checks do not prove regenerated post quality. Full release acceptance,
runtime identity, real reruns, inspection of saved outputs and exact original
preservation are pending. No task-completion or live-fix claim is made yet.

First full-suite attempt on `6cbd9ffb0` found missing Russian/English copy for
new research refusal codes and an outdated full-graph schedule fixture without
the new coverage-review port. Root added explicit error copy (55 focused tests
pass), and the accepted adaptation follow-up updated only that fixture while
preserving schedule/tenant/billing assertions (41 tests pass). Production logic
was not weakened to accommodate the fixture. A new clean-commit full-suite
receipt is required; this failed attempt is not release proof.

The same first attempt also exposed the catalogue guard's shared research
fixture missing the new scoped evidence-storage service. Root supplied that
fixture port without changing runtime behavior or weakening the injection and
paid-adapter assertions; all 128 catalogue guard tests pass.

Root also made the standalone-research continuation instructions explicit:
forward the complete original request and its reference text, not a search
query or rewritten summary. The optional query-only compatibility path remains
honestly labelled. The affected autonomy fixture set passes (11 tests).

The first run's recorded scenarios exposed the same missing storage fixture
and the deliberately changed adaptation summary expectation. Root accepted the
research stream's private scoped fixture ports after its exact scenario and
unchanged write/tenant/quota assertions passed. The interview scenario now
checks the saved post equals the actual draft under the untrusted-data wrapper;
its exact runner and two clean turns pass. No runtime workaround was added.

## Recovery and resources

Before code rollout the verified active image is `86008cab0c46`; it is the
rollback target. No schema change is planned. The channel's pre-correction
settings are privately retained for a scoped rollback. Reruns will use new
product conversations/artifacts, preserving original threads and texts.
Controlled short-lived owner-scoped session holds no account state change.
No broad image/cache/container cleanup is permitted.

graph-reviewed: prior local graph oriented the diagnosis; exact current source
is authoritative. A graph refresh is deferred to the accepted integration
boundary. Documentation and final delivery evidence remain in progress.
