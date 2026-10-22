# OpenRouter temporary HTTP 402 normalization

The provider documents `openrouter_in_flight_budget` as a transient reservation conflict with `Retry-After`. Exact provider metadata now exposes that refusal to the existing native SDK as HTTP 429. No transport retry loop or request resubmission was added. The original body and headers remain available, and the error-body read respects cancellation.

The follow-up is limited to `ai.text-chain.ts`, `ai.native-retries.ts`, and `ai-text-chain.test.cjs`. Only billing wording yields to the exact normalized provider discriminator. Permission, authentication, consent, bad request, terminal HTTP statuses and cancellation keep precedence. Permanent key-cap/credits/unknown 402 responses remain terminal.

Controlled REDs separately proved the original 402 misclassification, the misleading credit-balance wording edge, and an overly broad cause-chain bypass found in review. The final checks passed: two suites, 104 tests, 61.154 seconds; backend TypeScript and `git diff --check` both exited 0. Actual installed public Mastra SDK cases use one configured retry and two models: the three transient variants make exactly two requests to the primary, while key cap, credits, unknown source, wrapped permission/consent/auth and Stop each make exactly one request without falling back. Retry-After and per-attempt usage are asserted.

Source and tests are frozen. `evidence/openrouter-inflight-402-source-freeze.json` binds the final hashes, commands, exit codes, dependencies and logs; `evidence/openrouter-inflight-402.patch` contains only this bounded follow-up. `openrouter-inflight-402-docs.json` records the official provider contract and installed public retry declaration. Earlier pre-authority green receipts are historical and superseded by the final receipt.

The checks use synthetic provider responses and the actual installed native SDK. Root owns Gate9 compiled browser/full-suite acceptance. This stream performed no paid call, owner-stand mutation, restart, build, broad suite, push or deployment.
