---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task6_terra
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: person choosing a new or replacement LOCAL password
public_facade: one password policy across three backend DTOs and four frontend surfaces
bounded_acceptance: 7 to 64 Unicode code points with a Unicode letter, Unicode decimal digit, and Unicode punctuation or symbol
non_goals:
  - changing existing password hashes
  - Task 7 show or hide controls
  - authentication workflow changes
task_id: content-factory-next-f4ai
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: shared password policy
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 42eff3125752dde9d8ffa1fba06689e9d52c1d26
worktree: /home/me/code/content-factory-next
write_zone:
  - shared password policy module
  - two password DTOs
  - Settings LOCAL identity-link DTO
  - four named frontend surfaces
  - all frontend locales
  - focused contract tests
  - this artifact
success_criteria:
  - six characters fail
  - valid seven-character letter digit special-character password passes
  - seven characters without a special character fails
  - more than 64 characters fails
  - every named surface consumes the same policy module
selected_docs:
  - AGENTS.md
  - docs/prompts/codex-live-walkthrough-fixes.md
  - docs/design/component-authoring-rules.md
  - docs/design/component-inventory.md
selected_skills:
  - superpowers-test-driven-development
  - impeccable
  - lazyweb
selected_agents:
  - worker
parallel_group: none
depends_on_streams:
  - content-factory-next-3r4a
parallel_decision: sequential
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch; no separate worktree or runtime remained
risk_level: medium
risk_tags:
  - authentication
  - shared-contract
  - localization
affected_surfaces:
  - backend
  - registration
  - reset
  - public_saas
  - settings
invariants:
  - existing_hashes_untouched
  - no_visibility_control
  - special_is_punctuation_or_symbol
  - unicode_code_point_length
docs_impact: none
docs_reviewed: complete
docs_review_notes: Existing Input and Button primitives remain in use; password policy is visible as adjacent helper text rather than a new component or tooltip.
verification:
  - red_green_contract
  - policy_locale_design_guards
  - frontend_tsc
  - backend_tsc
  - diff_check
changed_files:
  - libraries/nestjs-libraries/src/dtos/auth/password.policy.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/forgot-return.password.dto.ts
  - libraries/nestjs-libraries/src/dtos/users/link-user-identity.dto.ts
  - libraries/nestjs-libraries/src/dtos/users/link-user-identity.dto.ts
  - apps/frontend/src/components/auth/register.tsx
  - apps/frontend/src/components/auth/forgot-return.tsx
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/password.policy.contract.test.cjs
  - tests/registration.workspace-contract.test.cjs
  - tests/helpers/load-ts-module.cjs
  - tests/user-identity.settings.test.cjs
  - tests/user-identity.settings.test.cjs
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-f4ai.md
explicit_defers:
  - none
---

# Summary

`password.policy.ts` is the one executable rule. It accepts only 7–64 Unicode code points containing at least one Unicode letter, one Unicode decimal digit, and one Unicode punctuation or symbol. The registration, reset, and Settings LOCAL identity-link backend DTOs use it; register and forgot-return use those DTOs through their existing resolver; public SaaS signup and Settings execute the same function before sending a request.

All 16 frontend locale files replace the old six-character copy with `password_policy_hint` and `password_policy_error`. The four password fields show the localized helper. No existing password or hash was changed. No Task 7 password-visibility UI was added.

## Exercised scenarios

| Scenario | Result |
| --- | --- |
| Normal: `Ж1!abcd` (7 code points) | accepted by policy, registration DTO, and reset DTO |
| Refusal: `A1!abc` (6 code points) | rejected by policy and both DTOs |
| Refusal: `Abcdef1` (7 without punctuation/symbol) | rejected by policy and both DTOs |
| Edge: 65 code points | rejected by policy and both DTOs |
| Direct Settings request: 6, no-symbol, or 65+ character LOCAL password | rejected by `LinkUserIdentityDto` before the link service |
| Locale boundary | every one of 16 locale files has both new policy keys and neither old six-character key |
| Copy boundary | the contract scan requires all four named frontend surfaces to import the policy and rejects old `12` / `6` checks |

## TDD record

RED was observed before production code: `tests/password.policy.contract.test.cjs` failed because `password.policy.ts` was absent. The later Settings DTO regression test also went red: it accepted six-character, no-symbol, and 65-character LOCAL passwords. GREEN then passed with all seven focused contract assertions. `registration.workspace-contract.test.cjs` was updated from its obsolete 12-character expectation and remains green.

## Assumptions

- “Letter” means a Unicode `\\p{L}` character, so Cyrillic and other scripts are accepted.
- “Digit” means Unicode decimal digit `\\p{Nd}`.
- “Special character” deliberately means Unicode punctuation or symbol (`\\p{P}` or `\\p{S}`), excluding a space alone.
- A code point is the length unit; this avoids counting one emoji as two UTF-16 units while retaining a simple consistent browser/server rule.

# Verification

- RED: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/password.policy.contract.test.cjs --runInBand` failed as expected before implementation because `password.policy.ts` was absent (ENOENT).
- GREEN: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/password.policy.contract.test.cjs tests/registration.workspace-contract.test.cjs tests/locale-key-set.test.cjs tests/credential.fields.test.cjs --runInBand` passed: 4 suites, 36 tests.
- Policy/locale/design: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/hint.guard.test.cjs --runInBand` passed: 4 suites, 51 tests.
- TypeScript: `pnpm --dir apps/frontend exec tsc --noEmit` and `pnpm --dir apps/backend exec tsc --noEmit` passed using Node 22.23.2.
- Root acceptance also ran the full affected identity/settings suite together with the policy contracts: 5 suites, 56 tests passed; its settings mocks now include the role and restricted-state dependencies introduced by the earlier role-navigation task.
- `git diff --check` passed. The locale JSON parser confirmed all 16 `password_policy_hint` / `password_policy_error` pairs.

# Risks / Follow-ups

- No defers. The Settings route's `LinkUserIdentityDto` also adopts the common policy, so direct requests and the frontend cannot diverge.

## Evidence notes

Lazyweb reference research supported persistent helper text directly adjacent to the password input; the existing `Input` helper was retained. Private research: https://www.lazyweb.com/agentic-search/75772e9f-ee15-43ca-8761-5fc445a4e8a7

The test module loader now follows a relative TypeScript dependency, allowing focused DTO contract tests to execute the extracted policy rather than mock it. No runtime behavior changed there.

## Independent review correction and Sol escalation

Аудит нашёл два пробела. Register и forgot-return теперь заменяют стабильное английское
сообщение validator на локализованный `password_policy_error`; public signup показывает именно эту ошибку,
а не generic registration failure. Legacy `@MinLength(3)` удалён.

Поскольку bcrypt обрезает вход на 72 bytes, Task 6 эскалирована с Terra на Sol. Политика осталась
честным контрактом 7–64 Unicode code points: новые пароли от 72 UTF-8 bytes хешируются как
версионный `SHA-256 → bcrypt`; более короткие и все старые unprefixed bcrypt hashes читаются прежним путём.
RED доказал коллизию на границе ровно 72 bytes; GREEN — policy/hashing 13/13 и frontend/backend tsc.
Остаточный риск: старый хеш когда-то принятого пароля 72+ bytes сохраняет историческое
усечение до следующей смены пароля; без исходного пароля его нельзя исправить автоматически.
