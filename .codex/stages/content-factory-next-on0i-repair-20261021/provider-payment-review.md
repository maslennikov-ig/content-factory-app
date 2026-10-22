# Provider payment and temporary OpenRouter reservation review

Verdict: approve both final bounded applied patches below. No open source findings remain. PAY1 / P2 is resolved in the final authority-preserving classifier. Compiled/browser/provider and complete three-part acceptance remain root-owned; Gate8 was aborted before its suite and is not successful acceptance.

| Scope | Approved patch SHA-256 |
| --- | --- |
| Safe payment error code, allowlist, RU/EN copy and HTTP tests: six files | `ee44454a085fbdaf836475145e5c91b9f82377146fefef4f2ca67debcc326f0a` |
| OpenRouter temporary reservation adapter and native retry regressions: three files | `a093ffba49037ebe918612b2f86552b9fc493da5c384b245208324c29abef41f` |

The reviewer inspected source, exact patches, existing logs, installed public declarations and current official documentation in `j9p5-model-led-20261018`, branch `codex/on0i-native-repair-20261021`, baseline `e74e059ea104593d2fac831eb989714a5b151263`. Only this report and its JSON companion were written. No tests, model/provider API calls, runtime/browser actions, store commands, restarts or source/test edits were performed. Official documentation was read anonymously; account/key/credit configuration was not accessed. Previous reviewer artifacts remain unchanged.

## Resolved finding PAY1 / P2

Classification: must-fix. Confidence: high. The initial transient classifier candidate computed a cause-chain capacity flag and used it to disable the entire terminal-message heuristic for every node. A wrapper with `Permission denied`, `consent_denied`, `invalid_api_key`, `access_denied` or `bad_request` could therefore become retryable merely because its cause was a documented temporary provider refusal. Application permission guards themselves were not removed, but this widened native retry policy beyond the intended billing distinction.

The owner acknowledged the source finding and reproduced all five incorrect classifications in `evidence/openrouter-inflight-402-authority.red.log`. Root authorized the bounded correction. Final `ai.native-retries.ts:62–78` keeps authority/authentication/permission/consent/invalid-request matching unconditional, separates billing hints, and allows only those hints to yield to exact known provider proof. Explicit terminal HTTP status, Abort and execution-budget Stop remain stronger than the temporary marker.

Expected value: genuine temporary reservation refusals can use native retries while authority denials remain terminal. Tradeoff: ambiguous refusals remain terminal unless the narrow structured provider evidence exists. Final unit checks cover five outer authority messages plus hard 402, Abort and budget Stop. Actual installed native SDK cases additionally prove wrapped permission/consent/auth each makes one request with no fallback, while wrapped billing can recover with two requests to the same primary. The final source hash is `43f3e4c91d7422d8d651e9d9248a37f89c93036a73a481f3867a8a3d1b68af7d`.

## Safe public payment code

`conductor.errors.ts:97` maps a provider-tagged direct or one-cause HTTP 402 to `AI_PROVIDER_PAYMENT_REQUIRED`. A plain domain 402 remains `AGENT_FAILED`; existing quota, configuration and processor-block mappings retain precedence. The code is added to the shared allowlist and both language copies. Copy describes provider balance/key-limit action without claims about fees, writes or other effects. No permission or approval contract changes.

The actual OpenAI provider V2 fetch fixture exercises native Session/DurableAgent/Memory and the real product HTTP handler. It asserts exactly one public error code, absence of the private provider-detail sentinel from the wire, zero writes/pending cards, settled/failed execution, one admission finished false and one provider request. This fixture disables retries/fallbacks, so its one-request assertion applies to that setup; the separate configured native cases below cover the relevant retry policy. Existing redacted diagnostic server logging remains; this review does not claim all diagnostic details disappear from server logs.

## Temporary reservation adaptation

Official OpenRouter documentation distinguishes `openrouter_in_flight_budget` with a retry delay from permanent key caps and insufficient credits, including a single request too large for the available reservation budget. The structured source controls classification; human hint wording is not the discriminator. This was independently checked against the [current official limits contract](https://openrouter.ai/docs/api_reference/limits).

`ai.text-chain.ts:1406–1441` gates normalization on configured OpenRouter, the exact host/chat-completion endpoint, POST, HTTP 402 and the exact structured `limit_source`. Only that known temporary case is exposed as ordinary HTTP 429. The response body and Retry-After are preserved. Key cap, credits, reason-only/unknown metadata, another provider/host and embeddings remain unchanged. Successful streams have no new body read or clone; a stalled error-body read remains signal-abortable.

The normalizer sends no retry or additional request. Existing native retry processors own delay, configured retry/fallback limits and cancellation. `isOpenRouterInFlightBudgetError` requires normalized SDK statusCode 429, the actual OpenRouter chat URL and the exact responseBody metadata before a billing wording exception is allowed. Global authority, terminal-status and Stop gates remain intact. No SDK package, request budget, output limit, writer/receipt contract, automatic consent or credential configuration changed.

The actual installed native SDK regression uses two configured models, one retry per model, inner SDK retries disabled and Retry-After one second. Temporary, credit-wording and wrapped-billing refusals each recover with two requests to the same primary and a measured wait of at least 900ms. Key cap, credits, unknown source and wrapped authority errors each stop after one request despite the available fallback. Stop during the delay produces no second request and completes before the one-second delay. Ledger assertions retain a failed known refusal and a distinct successful retry row; no billing reset is introduced. These are synthetic transport proofs, not live-provider or production acceptance.

## Exact bytes and reused receipts

Both patches were independently reversed in memory against all nine applied files, without executing or writing source. Seven original hashes match the Gate8 source manifest; the two files absent from that manifest match HEAD. All final hashes match. The adapter freeze `evidence/openrouter-inflight-402-source-freeze.json` SHA-256 `044b91a55005db9605af67ae2410a01924f020333847ef415575721111a950ef` has 16 matching source/dependency/tool inputs and six matching logs.

The earlier adapter patch `0c74…` and manifest `d44f…` contained an incorrect reconstructed old classifier line and are superseded. The corrected patch reconstructs native-retries baseline `089d90bcec97e2fa2405e4daeaa4ffd87ccd848ccb334c15359dfa52f0f26e45`, independently matching Gate8. Current final source/tests were unchanged during that stage-artifact correction. The pre-authority 99-test receipt is historical; only the final 104-test receipt binds the accepted classifier.

- Safe error-code RED: three expected failures, 101 passed. Final: three suites / 158 passed, matching saved log hash.
- Temporary adapter final: two suites / 104 passed, 61.154 seconds; backend no-emit TypeScript and diff receipts record exit 0 on the final frozen inputs.
- The reviewer inspected assertions and reused these receipts; no test or acceptance run was launched.

Root must still verify newly loaded compiled/UI/provider behavior and complete Jest, Node and Python acceptance on these final bytes. Focused evidence does not turn the aborted Gate8 into a pass, establish universal provider billing behavior or approve production/client delivery. Full paths, before/after hashes, PAY1 evidence, commands and action counts are in the JSON companion.
