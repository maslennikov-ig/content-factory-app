# Service-managed MiMo fallback

**Task:** `content-factory-next-8o2z`. **Owner:** root.
**Goal:** Service-managed OpenRouter text uses Luna first and
`xiaomi/mimo-v2.6-pro` as its built-in fallback. Own-key model choices remain
authoritative. The owner requested implementation under the existing local-only
boundary; no deployment, publication or paid comparison is included.

The existing instance/workspace settings and native ordered model entries own
the route. Change their shared fallback default, preserving the source of an
explicit single-model selection through configuration resolution. Keep current
retry limits, failed/uncertain-response accounting and optional discounted Sol
policy. No schema or API contract migration is needed.

## Scope and risks

All criteria belong to this one task and acceptance boundary:

- Included defaults and cleared settings resolve Luna -> MiMo, including native
  model entries and the settings response. Existing explicit operator overrides
  remain explicit.
- Own-key credentials, primary/role models, ordered/custom/disabled fallbacks
  survive, including an explicitly selected MiMo single-model fallback. Model
  equality must not erase the distinction between inherited and explicit.
- Modify only the verified owned local database instance fallback, with a
  before-image and compare-and-set. Verify other settings, usage rows and saved
  post artifacts are unchanged. Keep credentials outside Git and output.
- Public provider catalog verifies the exact ID and advertised capabilities;
  neither catalog metadata nor offline failover tests prove generation quality.

## Implementation and acceptance

Files: `ai.text-chain.ts`; admin default text; the schema's descriptive comment
only; focused text-chain, clients, instance/default-mode tests;
`docs/operations/agent-execution-budget.md`; current handoff and index.

- [x] Update shared default and preserve explicit single-model provenance.
- [x] Verify default transport/native route and own-key/disabled/custom settings
  with focused tests; retain existing uncertainty and bounded retry tests.
- [x] Build/type-check the affected backend; read actual local settings,
  effective configuration and native entries without a model request.
- [x] Review diff and preservation evidence, document local acceptance, commit
  owned files and close the task through the managed tracker.

Rollback: revert this task's source changes and compare-and-set the saved local
instance fallback before-image. Do not restore whole rows or touch production.

## Local acceptance evidence

- Focused acceptance: `pnpm exec jest --runInBand --coverage=false
  tests/instance-ai-defaults.test.cjs tests/ai-text-chain.test.cjs
  tests/ai.clients.test.cjs tests/ai-provider.usage-mode.test.cjs
  tests/agent-model-fallback-retry.test.cjs
  tests/admin-ai-defaults.screen.test.cjs` -> 6 suites, 193 tests passed.
  The initial regression run reproduced the old GLM default and the loss of an
  explicitly selected built-in fallback on the workspace key.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.build.json --incremental
  --tsBuildInfoFile /tmp/cf-8o2z-backend-types.tsbuildinfo` -> exit 0.
- From `apps/backend`, `pnpm exec nest build --config
  ../../../../../../../tmp/cf-5rgn-nest-incremental.json` -> exit 0. This reuses
  the retained owned local build configuration, without deleting runtime files.
- Actual owned local fallback changed `NULL -> xiaomi/mimo-v2.6-pro` with a
  scoped compare-and-set. Compiled settings response, effective included
  configuration and real native SDK entry constructors return Luna -> MiMo;
  no HTTP/model request or usage admission was made. The first inspection was
  refused by `AiUsageContextRequired`; the final read-only inspection constructs
  entries in the actual resolved configuration context without generating.
- Other instance fields match their original pre-switch digest. Twelve protected
  local tables match across readback; all 103 usage rows remain terminal and
  all 8 original/final readable artifacts match the prior acceptance manifest.
  Evidence and the minimal fallback before-image are private under
  `/home/me/.local/state/content-factory-next/service-mimo-default-20261020`.
- Graph read-only orientation used `resolveOrderedTextChainPolicy`, confirming
  settings and native entry consumers against the indexed source before edits.
  No structural changes require a refresh; the map remains at its prior accepted
  source baseline. Generated graph data and secrets are outside the diff.
- `pnpm run docs:check` -> exit 0, 205 files; `git diff --check` -> exit 0.

Production activation and paid MiMo quality/failover evaluation are not claimed.
The prior no-deploy boundary remains in force; accepted Telegram outputs retain
their original generation models and evidence.
