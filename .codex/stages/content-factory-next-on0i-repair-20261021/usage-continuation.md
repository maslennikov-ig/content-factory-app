# Queued continuation accounting

A native queued run can begin in its parent async context after the HTTP owner finalized that usage row. The prior accounting short-circuit treated the inherited config/ledger as still admitted, allowing new calls to append to a row whose costs were already persisted.

AiUsageService now recognizes closed ledgers. A deferred model execution and a new model factory inheriting a closed async context each open a fresh admission. Active nested operations still share their actual open admission. This is domain accounting only; it adds no model loop, routing, retry owner, or task spending ceiling.

Focused Node22.23.2 / pnpm10.6.1: `pnpm exec jest --runInBand --no-coverage tests/ai-usage.execution.test.cjs` => 1 suite / 37 tests PASS. Log: /tmp/on0i-repair-usage.log. Native outage continuation keeps the logical task admission open through all successor segments; separately queued user follow-ups use a new admission after the prior task settles.

Cold-recovery model wrappers also capture the server-validated member identity (optional prepareModelExecution actor argument), so execution outside HTTP context attributes its admission to that member. A focused regression covers this boundary; service call sites pass their trusted native identity.

Final extension: `voidUnstarted()` removes an admission only after the caller receives a positive native ownership verdict that it did not start a driver. It refuses any recorded text/search attempt, including uncertain attempts, and propagates deletion failures. The queue service handles only the typed native observer-only signal and does not settle another driver's task metadata. An ordinary empty ledger is not evidence of that verdict. Cold recovery can open a new billing row; a pre-crash unfinalized row remains unknown rather than a zero-cost/full-cost certificate.

Updated focused command (same pinned runtime): **1 suite / 40 tests PASS**, exit0; `/tmp/on0i-repair-usage-final.log`. Three added regressions verify tenant-scoped idempotent voiding, refusal to erase uncertain provider usage, and failed deletion staying retryable. `web.research.service.ts` only narrows its local usage interface to the three methods it consumes; research behavior is unchanged.
