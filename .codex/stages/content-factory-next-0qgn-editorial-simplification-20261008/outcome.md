# Bounded source acceptance: automatic editorial repair

Owner selected implementation of `.18/.19` on 08Oct2026. Root implemented
one combined automatic core repair and removed active stylistic deletion
callers from core writing/adaptation persistence. No new model critic,
mandatory issue-by-issue approvals, questions or interface were added.

The first core is checked locally. Copy/meta findings share one repair;
remaining findings do not cause a third invocation. Empty or failed repair
keeps the first text. Repair that increases copied spans/count/length is
rejected. The selected text owns its decisions; missing decisions in an
accepted repair do not inherit choices from the discarded draft.

Adaptation meaningful text reaches its body, editor post and event intact
(RU/EN fixtures), with technical citation-label handling retained. The old
standalone deletion utility remains for historical receipts/tests, but is
not called by the active core/adaptation paths. This does not assert that
all transformations everywhere in the product have been removed.

Acceptance: **8 suites / 274 tests PASS**, backend TypeScript **PASS**,
`git diff --check` **PASS**. Relevant original symptoms reproduced first:
5 failing /146 passing tests; retained `red.actual.log`. Final commands,
logs and source/test hashes: `root-acceptance.json`. Fault logs within the
mocked suites do not describe the production host. No real model/provider,
DB, browser, social publication, full suite or deployment occurred.

All **86 style/profile/historical prompt files** matched the base
`a18f7eda31f962c5de644fe177b7640ac156465e`. Default style-analysis coverage
and profile-field filters are unchanged. `.17` remains a future quality
comparison, including the recorded profile-filter question; `.10` search
work remains outside this stage. Real provider prose quality, latency and
invoices are unmeasured, not accepted from mocked calls.

Source implementation of `.18/.19` is closed in Beads; delivery is separately
tracked as `content-factory-next-0qgn.20`. The EPIC's original fields and
status were preserved. The delivery must integrate this scoped source change
onto verified current release code, preserving previously accepted adaptation
instruction presentation and loader, rather than publish the older working
frontend snapshot. Continuous EPIC goal remains inactive (`get_goal: null`).

docs-reviewed: updated — plan, product map, project index and handoff.
graph-reviewed: used — focused `withoutAudienceRemarks` query against stale
primary owner graph46ec4108, confirmed exact current callers; no integration
or graph refresh. Root self-review covered selected-text decisions, failure
fallback, both findings, copying regression and persistence consistency.

No delegated agents or owned runtime tails. Temporary stage logs are retained
as proof; unrelated files/worktrees/runtime were preserved. Rollback is a
scoped source revert; no stored drafts/profiles/schema were rewritten.
