# Native automatic model selection and own-key fallback

**Goal:** Activate the configured stronger model for difficult work through
Mastra's native model selection, retain native outage fallback, and expose
useful stage overrides. Implement and test on the local preview only.

**Task:** `content-factory-next-r4eq` (follow-up to accepted `x9q2` and `on0i`).
**Baseline:** `ece5bff6f`; worktree `local-review-20261022`. Root main contains
foreign video-planning work and must not be reset, stashed, or edited here.

## Product decisions

- Keep the primary text model configurable. Add one configurable stronger
  model and an automatic-selection toggle; defaults use the existing model
  configuration, with Sol6.1 as the current stronger-model preset.
- Offer four meaningful stages: assistant, material core, channel adaptation,
  and editorial review. Automatic choice is the default; an explicit model
  for a stage wins. Keep utility-role settings under the existing disclosure.
- Do not force all cores or all adaptations onto one model. The native
  classifier judges the actual task/material and semantic selection criteria.
  A strong existing core often needs only light adaptation; a difficult
  reframing can need stronger reasoning at the adaptation stage instead.
- Automatic choice and error fallback remain separate. Use native
  `Classifier.decide()` before constructing a unique native model array; native
  retry processors retain failover after a routing decision. The installed
  ModelSelectionProcessor only replaces the first attempt, which duplicates a
  promoted fallback, so it is not used for this ordered-array decision. No keyword/length complexity rules.
- Own-key mode uses only that workspace's provider/key. Its default compatible
  fallback must work; explicit empty/disabled chains remain authoritative.
  Configured model ids and explicit role overrides must survive save/reload.
- Keep the stronger-model processing tier configurable; activate the current
  Sol preset through Flex. Never silently turn a Flex-only attempt into
  Standard. Retain medium reasoning unless explicitly overridden.
- A routing decision must affect the actual core/adaptation/review generation,
  not only the conductor's prose. Reuse native Agent structured generation for
  the relevant content boundaries; preserve existing schemas and prompts.

## Scope and implementation

1. Backend routing contract and consumers (root): extend the existing role
   configuration metadata without a database migration; validate and return
   model-routing/fallback settings; invalidate existing caches; resolve
   provider-compatible candidates. Extend native conductor routing and add a
   small native text/structured generation boundary for the content stages.
   Add the adaptation role only where a real adaptation writer consumes it.
2. Settings surface: reuse `ai-provider.component.tsx` and its established
   controls/copy. Show the primary/stronger model, automatic choice, stage
   overrides, and ordered fallback settings with clear inherited/disabled
   states. Preserve untouched credentials and all unrelated settings.
3. Root local acceptance: focused resolver/persistence/routing/consumer checks,
   backend/frontend types when affected, and real local UI/provider scenarios.
   Reuse unchanged release checks; no full suite/build or deployment here.

## Acceptance

- Native selection chooses the primary for an ordinary request and the
  configured stronger model for difficult work without naming it in the
  user's request. Persist/inspect decisions and actual served-model receipts.
- Prove own-key fallback with one scoped primary-failure injection and a real
  Sol response; distinguish the injected failure from the real provider call.
- Prove settings round-trip, explicit stage pins, disabled fallback, provider
  compatibility, credential separation, and cache invalidation.
- Create/read a core and adaptation using their actual generation boundaries;
  prove the selected model served those outputs. Keep source/author context,
  saved versions and existing chat data intact. No duplicate content writes.
- Resume/reload the local chat and retain the accepted automatic-login flow.
- No social publication, messages, production mutation, or deployment.

## Premortem and recovery

| Failure | Evidence/mechanism | Mitigation and proof |
| --- | --- | --- |
| Router chooses Sol but the writer still uses Luna | Confirmed: conductor and domain SDK calls are separate | Wire native stage generation and inspect actual model receipts |
| Routing repeats a promoted fallback | A step override replaces only the first native entry | Native Classifier decides before building a unique array; cache one decision per request/task |
| Own-key starts using a managed key or loses an explicit opt-out | Existing resolver separates credentials and distinguishes inherited/empty | Preserve source and opt-out contracts; focused persistence/provider tests |
| Sol runs at Standard rates after Flex refusal | Current discounted-only routing does not cover own-key presets | Carry the configured tier into every native attempt; inspect receipts |
| Retry/decision calls multiply bills or repeat a saved write | Existing native and transport layers both have attempt controls | One retry owner; keep receipts/idempotency and uncertain-response guards |
| Structured content regresses | Existing core/adaptation/review callers use schemas and repair logic | Reuse prompts/schemas and verify actual saved outputs |
| Executor invents native APIs or broadens the refactor | Installed Mastra1.78 differs from cached docs1.45 | Confirm installed types/source plus primary docs; bounded consumers only |

Rollback: revert the cohesive source change and restore the captured local
model settings. Keep independent local databases, provider receipts, accepted
chat history, previous compiled backend builds and all unrelated work. Restart
only the owned local backend/frontend after proving no active work.

## Documentation and ownership

`docs-resolve` found `@mastra/core@1.78.0` in the lockfile, but L1 docs are stale
at1.45.0 and download returned404. Use installed declarations/source and
Context7/official Mastra pages; record exact evidence before relying on APIs.
The owner main graph (`dd67538d`,18Oct) is read-only orientation, confirmed
against current source. Native-selection docs and content-call mapping are
bounded read-only child streams; root owns the plan, code integration and
final acceptance. Linear remains canonical; task publication is server-owned.


## Accepted implementation streams

- Native documentation and call-map streams delivered read-only findings;
  accepted installed1.78 Classifier/Agent/array contracts. No cleanup needed.
- Settings UI delivered shared four-stage/profile controls and ordered fallback
  editor, preserving key-only submission, provider resets and inherited defaults.
  Focused settings10 and existing admin33 checks passed; actual local UI verified.
- Native stage adapter delivered core/adapt/review invocation, original schemas,
  raw JSON mode and cancellation. Adapter10, adaptation25 and review125 checks
  passed; backend types passed. No worker-owned runtime/artifacts to clean.
- Conductor delivered sanitized preflight input, native routing, actual subagent
  overrides and isolated retry contexts. Conductor25 checks passed. Root accepted
  delivery and retained existing shared runtime/history; no destructive cleanup.
- Root acceptance found and fixed a real classifier shorthand response that was
  silently treated as base. Native structured output now describes each answer
  object. A malformed decision raises an error; optional selector outage abstains.
- Root also fixed nested native model preparation without an actual usage ledger:
  the classifier opens a real admission, rather than inheriting configuration
  scope as if it were a paid operation. The focused regression passes.


## Root local acceptance

PASS on4278/3478; no deployment, source push or production mutation.

| Scenario | Observed result |
| --- | --- |
| Routine adaptation, unpinned Auto | Real native classifier/base Luna; native schema generated two sentences |
| Actual core writer, unpinned Auto | Classifier chose Sol; real upstream502 then native Luna fallback completed model-written core |
| Difficult reasoning in a new UI chat | No model name in task; real native classifier chose Sol; Sol returned a saved causal analysis |
| Main-model outage | Only uniquely marked primary429 injected; real Sol answered, no duplicate Sol attempt |
| Fresh research on final stand | Four real Luna calls + Exa200; Python3.15.1/21Oct with official release source |
| Settings and histories | API/UI reload, per-stage pins, Auto toggles, explicit empty/reset/retries, exact two-chat histories, encrypted own key/other tenant preserved |
| Accounting | All76225input/909output model tokens recorded; model+search USD0.01345119145 agrees within existing Decimal(14,8) rounding |

Evidence is private under
`~/.local/state/content-factory-next/local-review-20261022/`:
`r4eq-real-stages-validated.private.json`, `r4eq-real-stages.private.json`
(scoped429 case), `r4eq-ui-complex.private.json`,
`r4eq-final-search.private.json`, `r4eq-accounting.json`,
`r4eq-history-roundtrip.json`, `r4eq-settings-roundtrip.json`,
`r4eq-ui-settings.json`, `r4eq-settings-routing-visible.png`, and
`r4eq-activation.json`. Earlier classifier diagnosis is retained as failure
history, not acceptance evidence.

Root checks: `pnpm exec jest --runInBand --coverage=false
 tests/ai-model-routing.native.test.cjs`17PASS; usage/native-retry57PASS;
focused design/consumer35PASS; existing provider/key/chain/defaults and accepted
worker checks reused for unchanged behavior. Backend private `tsc` emit and
frontend incremental `tsc --noEmit` exit0; `git diff --check` clean.
No full suite/build. Actual real-provider evidence covers own-key OpenRouter and
Exa; direct OpenAI Responses uses installed-SDK transport fixtures, not a real
OpenAI credential. The existing manual content-quality epic remains separate.

`docs-reviewed: updated`; `graph-reviewed: used` (owner graph read-only;
confirmed exact current entrypoints). Local server remains available for the
owner; no shared worktree/runtime or historical provider output removed.
