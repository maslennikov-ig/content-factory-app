# Request intent and human fact selection: independent final review

Verdict: approved bounded source change against final freeze `9a25a315d86725d988042d2b0943562fe08f0e9123ce8e9f06d3ceed1498e74d`; no open source findings. Real model interpretation and root acceptance remain pending. Earlier failed natural-case evidence remains failed; these controlled checks do not convert it into a successful saved CORE.

The reviewer worked read-only in `j9p5-model-led-20261018`, branch `codex/on0i-native-repair-20261021`, baseline `e74e059ea104593d2fac831eb989714a5b151263`. Only this report and its JSON companion were written for this follow-up. No tests, model/provider calls, browser/runtime actions, store commands, restart, commit, push or deployment were performed. Existing private captures and owner receipts were read without copying private originals into this report.

## Observed defect and policy provenance

R3 / P2, must-fix for the requested natural scenario, high confidence: a fresh model interpretation could turn assistant evidence verification and saved-result checking into an outstanding human fact-selection requirement. The existing guard then correctly refused the falsely classified task before writer admission. This is a semantic false positive, not evidence that a consent guard should be bypassed.

The reviewed actual receipt `real-local-qa-scenario-recovery-postgresql-skip-locked.json` records 187652ms, no changed piece, no pending card, no final assistant text, failed lifecycle and `FAIL_NO_REQUESTED_SAVED_ARTIFACT`. Its private stream has initial `piece_create(selection=model)` and a final standalone `piece_create_from-research` with three exact passages, no selection/request argument, and text exactly equal to the original prompt. The exact final refusal is the Russian message unique to `intake.service.ts:1119–1123`.

Independent inspection of the existing private snapshot capture confirmed that the earlier native snapshot retained internal model policy, humanFactSelection false, the exact original input and no model continuation. The later standalone research had no request or native/parent ancestry and no continuation. It therefore prepared a fresh brief; this is separate from the previously repaired native-plan restoration path.

The call-site default at `piece.capabilities.ts:190` is model. Its writing body at lines 434–443 supplies no structured request; `intake.service.ts:485–501` consequently creates none. The early policy guard at line 690 passes. The sole setter before finish, `fillBrief` at lines 1625–1631, adopts parsed model understanding only when request is absent. The unique late refusal proves the fresh humanFactSelection value was true. No final provider body or persisted late plan was captured: that value is inferred from the exact executed branch, rather than directly read from the provider response. The undescribed Boolean and missing actor/stage distinction were an identified contract ambiguity, not a deterministic explanation of the model's internal reasoning.

Impact: valid assistant-led work stops without the requested artifact. Suggested and implemented bounded correction: define the human action in the model schema and actual brief instruction while retaining all existing policy checks. Expected value: the model receives the missing distinction at both consumption boundaries. Tradeoff: interpretation remains model-dependent; this change supplies no deterministic success guarantee or permission to ignore an actual human requirement.

## Exact bounded change

Both old hashes were independently reconstructed by reversing exactly one line in each application file, and matched the declared pre-change bytes:

| File | Reviewed change | Final SHA-256 |
| --- | --- | --- |
| `request-understanding.ts:34` | Description on the underlying Boolean before optional/nullable conversion | `4abf4bdaf2bc02b1ef9c0effe8f256811249c83605e3803a029254f06ea56ca2` |
| `intake.prompts.v12.ts:51` | One generic HUMAN FACT SELECTION instruction | `58a66004f5f8c4c04aa34f68bb0e4c74678081bfbf48c30ac59d724227245579` |

The definition covers a human user or designated reviewer choosing/approving facts before writing. It expressly preserves an editor/client requirement. Assistant research, exact evidence selection and reading/checking the saved result do not by themselves require human selection. The field describes a required human step and is never consent or proof that a signed card was answered. Current v13 reuses the v12 prompt/schema, so the clarification reaches the active brief path as well as its compatible version.

No field, default, Boolean value, normalizer, selection policy, signed-card flow, source ACL, snapshot lifetime, write claim or writer logic changed. Supplied structured request constraints still survive a later model answer. There is no phrase-based forced false, new retry mechanism, topic condition or consent bypass. The initial user-only wording candidate is explicitly superseded; this approval covers the final user-or-designated-reviewer wording.

## Existing verification and remaining bounds

All 32 entries in `research-person-selection-final-freeze.json` match current bytes: 12 application files, 4 tests, 10 integrated files and 6 evidence artifacts. The previous Stop freeze was separately rechecked: all 32 entries still match. Previous `research-final-review.*` and `final-native-tail-recovery-review.*` retain their delivered hashes and were not rewritten.

- Controlled RED: the exact provider schema conversion had two missing-description failures; four other checks passed and 45 unrelated cases were filtered out. These failures concern missing contract metadata, not reproduced real-model semantics.
- Final affected receipt: 4 suites, 89 passed, 0 failed, 0 skipped, exit 0. Backend no-emit TypeScript and scoped diff receipts also record exit 0. The historical 88-test candidate is not the final receipt.
- Actual LangChain/OpenAI `zodResponseFormat` conversion retains the nonempty underlying Boolean description in both compatible and current brief schemas. True and false pass the model normalizer unchanged.
- Tool/service consumer fixtures read owned saved source text and submit exact passages. A supplied model false writes once. Supplied model true for the user or designated editor refuses before write/claim and gets neither revision guidance nor recovery proof. These fixtures inject model output; they verify wiring and guards, not semantic classification by a real model.
- Four original native-context variants retain their authoritative request, including false, even when a later model response proposes true. Existing explicit-person policy, lifetime and uncertain-write checks remain in the affected receipts.

Root must still run the same natural prompt and an explicit human-selection case on the newly loaded bytes, inspect saved CORE/source semantics and any pending card, then complete its compiled/UI/full three-part acceptance. The owner-provided schema and prompt clarification is approved at source level only. No production or client acceptance is implied. Exact hashes, inspected evidence and action counts are in the JSON companion.
