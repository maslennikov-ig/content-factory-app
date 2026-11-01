# Live research/creation audit — 27 October 2026

Owner requested diagnosis, not a paid replay. Code baseline `ee1e1927f`.
Follow-up bug: `content-factory-next-v8ie` (open, P1). Related provider/editorial
qualification `content-factory-next-eqh5` remains open. The earlier offline/native
acceptance is not proof of this live mixed-capture scenario.

Private source: `/home/me/.local/state/content-factory-next/honey-6013-20261027/cba-audit/`.
Raw request, thread, trace, snapshots, drafts and identifiers stay outside Git.
No model/search call, chat/artifact rewrite, configuration change, restart,
push, deployment or production mutation was performed by this audit.

## Actual refusal causes

The two visible errors are two distinct `piece.create.from-research` attempts,
both carrying `INTAKE_RESEARCH_SELECTION_INVALID`:

1. `references` plus explicit `passages` violates the existing mutually exclusive
   modes. Refusal occurs before quote checking. It lacks `canReviseInput`.
2. The corrected input contains 2 distinct captures/11 fact keys, within 8/200
   count limits. However, `mergeStoredResearchEvidence` accepts only standalone
   `res_` captures; the first capture is a native intake UUID. The model-facing
   tool accepts either capture individually but cannot combine this pair.

This is an argument/capture compatibility failure. The UI's statement that facts
do not match saved sources is not evidence of a quotation or factual mismatch.
Offline execution of the existing helpers verifies all 5 submitted passages and
all 3 selected standalone facts against their own saved sources. It does not
independently verify every world claim in the news article.

The third, native-only 8-fact selection creates one CORE; one Telegram adaptation
and one DRAFT post are subsequently saved. There is no duplicate published post.

## Additional findings

- **Supplementary evidence lost.** The successful native UUID path calls
  `selectResearchForModel` with its frozen original plan. The 720-character
  supplementary `material` passed in this attempt is ignored on that path.
  New material about the 28-day series, reset documentation and changes within
  the missing interval remains known to the conductor but absent from the writer.
- **Incorrect final technical outcome.** The native run finishes `stop`, but
  execution/native pointer are settled `failed`. `AgentTurnLifecycle.track`
  retains a failed flag from the first unspent refusal lacking `canReviseInput`.
  The actual three saved outputs reproduce `failed` on the real lifecycle class
  in an isolated process. Adding only that recovery marker counterfactually
  yields `completed`. No persisted task state was patched.
- **Invalid semantic brief.** Saved thesis=`position`, position=`disagreement`,
  disagreement=`audience`; the initial title=`position` is later renamed by the
  conductor. Corrections are empty. These values pass the string schema and
  text normalization; a separate raw provider response at this legacy structured
  call boundary is unavailable. Do not invent a literal-word rejection rule.
- **Accurate editorial advice.** Saved adaptation length is 1791 UTF-16 units
  (1788 Unicode code points), exceeding the applied 1500. It has 3 emoji and 2 reader questions plus a question heading; the reviewer
  flags repetition and compares emoji count with an expected 1–2 range. The
  integration row has no explicit writingProfile, so these expectations must not
  be attributed to a manual owner setting. Advisory review saves DRAFT under the owner's existing nonblocking policy.
  The result still needs editorial work; no new quality blockade was installed.
- **Disabled direct fetch.** Backend reports `POLICY_DISABLED` for the supplied
  release-notes page; `SOURCE_DIRECT_FETCH` is not enabled. Search/captured-source
  reads are separate and worked. This is a capability/configuration limitation,
  not a model-provider spending refusal. No capability was enabled by the audit.
- **Incomplete coverage.** Saved assessment and the final response disclose a
  partial reporting interval and missing primary confirmation of the daily-series
  promise. Supplementary results could narrow some gaps but were not merged.

The trace contains 246 spans, 9 conductor model steps, 172.455 seconds and no native
error span; the final model finish is `stop`. The pre-existing request ledger
reports about USD 0.31 across its domain/conductor operations. Neither the trace's
normal finish nor saved artifacts certify semantic completeness. There are no
new usage rows after the audit's first snapshot.

## Questions

Saved `questions.items`, `questions.answered` and author `answers` are empty.
The retained initial state has `filled.questions=[]`, `inputSufficient=false`,
`skipInterview=false`, with no interview answers or delegation. Nothing was lost
by the new progress disclosure; no person answer was fabricated.

The initial insufficiency concerns missing public research. The current v13
prompt deliberately asks only for required author-owned information/material
private choices; public evidence is for research. Topic, reporting interval,
language, previous coverage and target channel were given, so zero introductory
questions can be legitimate. Native selected-research continuation intentionally
avoids buying a redundant pre-search brief verdict. Do not add mandatory stock
questions or turn technical argument repair into user questions.

A genuine choice, such as materially changing a complete account into a short
digest/series when the requested scope cannot fit, should be resolved explicitly.
The malformed brief and the lost evidence mean this run cannot be treated as a
qualified example of reliable autonomous editorial decisions.

## Evidence and preservation

`offline-validation.json` reproduces lifecycle outcomes; `source-validation.json`
verifies literal source selections. `audit-preservation.json` confirms unchanged
messages/pending/execution and 12 original dirty-file hashes. The independent
Prisma readback in `artifact-preservation.json` confirms unchanged CORE,
derivation and DRAFT, zero new usage rows, zero audit model/search calls.
Fix implementation remains open in the canonical task; this audit only adds docs.

docs-reviewed: updated - diagnosis, open follow-up and handoff.
graph-reviewed: used - borrowed owner graph dd67538d, IntakeService query returned
no neighbors and changed source; exact current source establishes the findings.
No graph refresh or external extraction. Managed Linear/Beads server owns sync.
