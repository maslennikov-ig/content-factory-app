# Provider payment client contract review

Verdict: approve exact one-line candidate patch SHA-256 `b9d5a77a360bd14a238e94ec7d7607e1d45c4144d2d303db207638237102f274`. No open findings against this candidate. It has not been applied: the Gate9 source remains frozen at `6d8d8211d94ee168a17eff68986493acc136d6764b65ee554a313f94ad4d333b`. The approved candidate hash is `452debdfc80866782e022b996b1bb331fe7d1158ab11cb90a86ca8a42b7066b7`.

This independent review writes only this report and its JSON companion. No application/test/QA-helper changes, tests, model/provider calls, browser/runtime actions, builds, restarts or full-suite reruns were performed. Earlier provider reviews remain unchanged. Root confirmed candidate session 8088 finished with exit 0; its final log reports two suites / 55 tests passed and the original source unchanged.

## Existing defect and bounded correction

C1 / P2, must-fix, high confidence: the backend declares `AI_PROVIDER_PAYMENT_REQUIRED`, while the frontend's mirrored `AGENT_ERROR_CODES` omits it. The active Gate9 full-suite log reports the exact existing mirror equality assertion failing on that missing literal. The previous payment review did not inspect this frontend declaration; this review closes that consumer-contract coverage gap without changing its historical receipt.

The candidate adds only that literal after `AI_PROVIDER_UNAVAILABLE` in `agent.contract.ts:77`. It changes no parser, renderer, intent handling, native execution/retry/consent policy or text. The current native adapter's public error vocabulary is mirrored exactly. The original mirror guard remains byte-identical to HEAD: `agent-parts.mirror.guard.test.cjs:123` compares the complete AST-extracted literal values on both sides, including order. Its lines 130–149 also require both `what` and `next` copy for every public code in both languages. No assertion is weakened, skipped or replaced.

Impact: the declared client/server contract drifts and release acceptance fails. Expected value: restore exact parity and continue guarding future public-code changes. Tradeoff: the repository keeps its existing explicit mirror design. The current disk defect remains until root applies this exact candidate after the frozen run.

## Actual consumer trace

- `errorCodeOf` at `agent.contract.ts:1745` retains a plain identifier or JSON `code`; `readDoorError` at line 1058 extracts a door body's `code`. These decoders do not use `AGENT_ERROR_CODES` as a runtime whitelist. The mirror omission therefore does not establish that they lost this code or displayed generic text; the code was already decodable.
- `readMessageBlocks` at lines 2476–2483 turns a titled product tool's `output-error` into an error block and passes its decoded code. Untitled ordinary tool parts are intentionally filtered at lines 2421–2434; that guard is unchanged.
- `agent.conversation.tsx:1185` builds the chat error code, and lines 1585–1589 pass it to `ErrorCard`. The tool error branch at lines 1410–1447 likewise passes the block code.
- `agent.cards.tsx:1253` resolves `errorWordsFor`, then renders only the selected `what` and `next` at lines 1279–1280. `agent.copy.ts:2013` selects the dictionary entry and marks it known. The existing RU entry at line 724 and EN entry at line 1507 already explain balance/key-limit action without fees, writes or effect claims.

For this known payment code the renderer uses those localized sentences and suppresses the unknown-code diagnostic line. It does not receive or render the raw provider error message/body. Unknown-code fallback behavior remains unchanged; this one-line patch introduces no new detail or secret transport. A focused search found the frontend array only at its declaration, so no additional frontend runtime selector over that array was inferred.

## Existing proof and limits

Root's stage-only harness verifies the original/candidate hashes, substitutes only the exact client source read, and executes actual exported decoders plus the unchanged mirror/adapter suites. It asserts plain and JSON payment codes, a door code, a correctly titled tool error block, and RU/EN copy. The saved terminal log contains 55/55 passed, exit 0 is recorded in the manifest, and `SOURCE_UNCHANGED` matches the original hash. The candidate bytes were independently reconstructed as exactly one inserted line; patch, candidate, original and final log hashes match.

The first standalone probe omitted the product tool title and correctly produced no block. Root corrected only that synthetic input shape. Its retained shape-mismatch log is excluded from product-failure and acceptance evidence; no product title guard changed. The final probe checks decoder/copy wiring, not a rendered payment-specific React card or a browser flow. That renderer path was source-reviewed.

Root still owns completing the current Gate9 receipt, applying the exact candidate afterward and running acceptance on the resulting source. This approval does not restamp the still-running full suite, claim the disk is repaired, or imply production/client acceptance. The JSON companion records the full consumer/source hashes, candidate metadata, immutable log evidence and zero reviewer execution counts.
