# Search reader language and empty results

Task lineage: `content-factory-next-ec48.7` / `fn33.132`, bounded follow-up to
public27; root owns Beads, acceptance, integration and release.
Base: `d70c2106295e0c396d3917545447da5c94c331a6`.
Branch: `codex/search-reader-negative-state-2026-10-02`.
Ownership: only `summaryNeedsLanguage`, existing search panel summary visibility
and RU/EN empty copy, their affected tests, summary contract and this stage.
The accepted registration commit `a074be581f0af82319ed619c72ae6f39496a1ddb`
is frozen in its separate worktree and is not part of this stream.

## Decision and bounded examples

- Given English provider prose with isolated `1С:Предприятие` names, when a
  Russian reader requests it, the existing one cheap summary pass runs once.
  An English reader keeps the no-rewrite path. Original sources/facts remain.
- Given Russian prose with English technical names/acronyms, Russian does not
  buy a rewrite; English can use the same existing pass.
- Given mixed scripts, only words with at least two consecutive lowercase
  letters vote. A different script must have at least three prose words and
  at least twice the other script's word count to justify a correction.
  Single-script prose (including short/uppercase answers) keeps the historical
  correction path and other-script fallback. Empty, purely numeric, mixed acronym-only and balanced
  bilingual inputs do not justify a new pass. Balanced mixed text previously
  passed through for `ru` but could cause correction for `en`; both now abstain.
  This is a deterministic spending heuristic, not full language identification;
  short mixed prose and long foreign proper names can remain ambiguous.
- Given zero usable HTTP excerpts (including rows filtered by the existing
  adapter), the panel hides provider summary prose and its heading. It says
  no suitable source excerpts were found and suggests refining the subject.
  It makes no claim that the web contains no material. Positive results still
  display the summary, excerpts and existing evidence actions.

Provider/admission/cache/candidate/controller behavior, source provenance,
caller-supplied-query bypass, internal reader opt-in and the at-most-one cheap
summary call are preserved. No new synthesis, retry, verifier or provider call.
Useful provider context may be hidden at zero results: accepted root decision.

## Sources and proof boundary

Documentation: installed service/controller/adapter/tests, component inventory
and authoring rules; no external/versioned API claim or new dependency.
Root frozen zero-diagnosis report proves facts0/nonempty-summary/candidate-only
links hidden; actual raw provider admission cause remains unknown.
Recorded public27 1C summary is used as offline prose, not factual truth.
Meaningful RED/GREEN covers actual service branch budgets and React rendering;
then focused search regressions, backend/frontend no-emit types and diff check.
No full suite, paid/live replay, production/push or Beads mutation.
No new components, styles, runtime resources or Graphify refresh; exact owned
files give the local flow, with graph integration review left to root.
