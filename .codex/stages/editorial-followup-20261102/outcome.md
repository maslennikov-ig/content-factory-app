# Telegram editorial follow-up — local acceptance

Task: `content-factory-next-g4qy`. Source is the existing
`codex/telegram-editorial-quality-20261102` worktree. Implementation is prepared for the owner-authorized release; production is
`0bdd01349db6` until the separately recorded switch and acceptance.

## Diagnosis

Read the owner-linked production chat through Mastra's native read methods,
with initialization disabled and a read-only DB session. The conductor knew
the configured range but did not propose overrides. A metadata title existed
without a published headline. Its instruction explicitly prohibited revisions
after advisory findings. A date warning also needed evidence assessment: the
original primary announcement supports the preview date despite vague relative
wording in a later article. No live chat, settings or post was changed.

## Local result

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

## Verification

- Initial focused defect proof: 2 intended failures (correction was ignored),
  8 safety cases passed. Final coverage suite: 47 passed.
- Final affected review/result/policy suites: 4 suites / 65 tests passed.
- Reused unchanged channel/instructions/settings-approval evidence: 4 suites /
  92 tests passed from the initial 8-suite / 153-test acceptance.
- Conductor suite after the final instruction change: 108 tests passed.
- Combined affected population: 9 suites / 265 tests passed, no double counting.
- `pnpm exec tsc --project apps/backend/tsconfig.json --noEmit --incremental false`
  passed on Node 22.23.2. The only later production-source change was settled-choice
  instruction wording, covered by the conductor suite.
- `python3 scripts/docs/check_docs.py`: documentation links passed.
- `git diff --check`: passed.

The following release stage will record full suite/build, public CI and runtime
acceptance separately. No paid model QA or live publishing was performed. Tests use scripted model outputs; semantic quality and spontaneous
proposal behavior on a real provider remain unverified. No production acceptance
is claimed for this local follow-up.

Docs-reviewed: updated — common policy, research basis, plan, handoff/index.
Graph-reviewed: blocked — no local/sibling graph available; exact owning paths
were taken from the project index and current source.
Cleanup: no preview/process/worktree created. Keep the minimal private trace and
verification logs outside Git under the task-owned local-state directory; preserve
the unrelated pre-existing `.codex/orchestrator.toml` edit and prior release data.
GitHub sync: managed server only; no native/local publisher triggered. Owner requested production delivery; release work remains in progress. Paid
real-provider evaluation is separate.

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
Artifacts are private under `editorial-agent-length-20261102`. Browser acceptance
is in progress; neither child performs Git delivery or production changes.
