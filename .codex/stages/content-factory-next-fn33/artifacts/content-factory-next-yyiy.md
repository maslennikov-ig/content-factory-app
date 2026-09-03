---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task7_terra_then_luna
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: person entering a password in any shipped authentication flow
public_facade: one accessible password field with show and hide control
bounded_acceptance: Terra authors the component first; Luna then adopts it in five named files without a duplicate control
non_goals:
  - changing password policy
  - profile navigation
  - authentication behavior
task_id: content-factory-next-yyiy
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: shared visible-password control
milestone_status: accepted
agent_type: sequential_workers
subagent_model: gpt-5.6-terra_then_gpt-5.6-luna
reasoning_effort: medium_then_low
model_reasoning_rationale: Terra owns component semantics and accessibility; Luna performs bounded mechanical adoption
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 2aa5c7ab2ea5e877ee1d3aaa24408edc7594021e
worktree: /home/me/code/content-factory-next
write_zone:
  - one shared password field component
  - component inventory
  - focused component guards
  - five named consumer files
  - sixteen frontend locales
  - affected consumer tests
  - task artifact
success_criteria:
  - one component toggles password and text without losing value or field semantics
  - control has translated show and hide aria labels
  - both themes use cf tokens with full interaction states
  - all password inputs in five named files use the component
  - no second hand-built visibility control exists
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - docs/design/component-inventory.md
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - superpowers-test-driven-development
  - impeccable
  - lazyweb
selected_agents:
  - worker_terra_component
  - worker_luna_adoption
catalog_candidates:
  - shared-input-extension
parallel_group: none
depends_on_streams:
  - content-factory-next-f4ai
parallel_decision: sequential_by_contract
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch streams; no separate worktree or runtime remained
risk_level: medium
risk_tags:
  - accessibility
  - shared-component
  - localization
affected_surfaces:
  - ui
  - authentication
invariants:
  - single-component
  - no-password-policy-change
  - translated-control-name
docs_impact: behavior
docs_reviewed: complete
docs_review_notes: Read AGENTS.md, walkthrough, Beads task, DESIGN.md, component inventory, component authoring rules, Graphify report/query and the canonical Input implementation.
verification:
  - Terra component RED and GREEN
  - Luna adoption RED and GREEN
  - locale design foundation and contrast guards
  - frontend TypeScript check
  - git diff check
changed_files:
  - libraries/react-shared-libraries/src/form/input.tsx
  - libraries/react-shared-libraries/src/form/password-input.tsx
  - tests/password-input.component.test.cjs
  - docs/design/component-inventory.md
  - tests/password-input.adoption.test.cjs
  - tests/credential.fields.test.cjs
  - tests/auth-conversion.frontend.test.cjs
  - tests/newsletter.consent.frontend.test.cjs
  - tests/public-saas-registration.test.cjs
  - tests/user-identity.settings.test.cjs
  - apps/frontend/src/components/auth/login.tsx
  - apps/frontend/src/components/auth/register.tsx
  - apps/frontend/src/components/auth/forgot-return.tsx
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-yyiy.md
explicit_defers:
  - none
---

# Summary

Терра создала общий `PasswordInput`; после передачи Луна заменяет им пять
именованных потребителей и добавляет локализованные строки. Общего коммита пока нет.

## Terra phase — returned to Luna

### API contract

- `@contentfactory/react/form/password-input` экспортирует `PasswordInput`.
- Компонент принимает все применимые свойства `Input`, кроме `type` и `action`,
  и требует уже локализованные `showPasswordLabel` и `hidePasswordLabel`.
- Он передаёт `name`, `value`, обработчики, ref и react-hook-form-интеграцию
  каноническому `Input`; видимость меняет только нативный `type` между
  `password` и `text`.

### States and accessibility

- У action-кнопки есть отдельное имя, `type="button"`, `aria-pressed` и disabled.
- Default, hover, active, keyboard focus и disabled используют только `cf-*`
  токены; внешнее focus-ring `Input` остаётся видимым, когда фокус на toggle.
- Один внутренний state не меняет имя, значение или form wiring поля.

### TDD record

- RED: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/password-input.component.test.cjs --runInBand`
  упал ожидаемо: `ENOENT` для ещё отсутствующего
  `libraries/react-shared-libraries/src/form/password-input.tsx`.
- GREEN: тот же focused test проходит: 1 suite, 3 tests. Он проверяет обёртку
  над `Input`, нативные name/value/ref свойства, `type="button"`, переход
  `password → text` и смену accessible name.

### Assumptions

- Локализация принадлежит фазе Luna: labels передаются строками, поэтому
  компонент не добавляет английский fallback и не создаёт ключи локалей сам.
- Изменение `Input` ограничено forwarding refs, чтобы новый компонент не ломал
  ref или react-hook-form при обёртке.

### Files in Terra phase

- `libraries/react-shared-libraries/src/form/input.tsx`
- `libraries/react-shared-libraries/src/form/password-input.tsx`
- `tests/password-input.component.test.cjs`
- `docs/design/component-inventory.md`
- `.codex/stages/content-factory-next-fn33/artifacts/content-factory-next-yyiy.md`

# Verification

- Terra GREEN: focused component test, design/foundation/contrast/shared-form
  guards and frontend TypeScript check passed; Luna adoption checks remain.

# Risks / Follow-ups

Кнопка видимости не должна отправлять форму, менять значение, перехватывать имя поля или создавать второй tab-stop вне ожидаемого контрола.

## Luna phase — adoption handoff

- RED: `pnpm exec jest tests/password-input.adoption.test.cjs --runInBand` — все
  пять именованных потребителей падали, пока в них оставались сырые `Input`.
- GREEN: adoption guard проходит 5/5; component, locale, design, contrast,
  foundation и shared-form-control guards проходят 83/83; frontend `tsc
  --noEmit` и `git diff --check` проходят.
- Adoption: все password-поля в пяти файлах используют `PasswordInput`; login
  сохраняет `current-password`, остальные — `new-password`; repeat password
  в reset-flow также переехал. Labels `show_password`/`hide_password` добавлены
  во все 16 locale bundles.
- Existing consumer tests: all seven root acceptance suites pass (61/61), after
  adding the required source-loader mocks for the new shared control and the
  existing password policy/translation imports. Production typecheck and
  focused guards remain green; root also removed the new custom-prop warnings
  from the password-field mocks.
- Assumptions: `show_password` and `hide_password` are shared translation keys;
  public signup uses `useT` labels while its audience copy remains unchanged.
- Edge/refusal: no password policy, field name/value, handlers, autocomplete,
  required/disabled, or form registration changed; no second hand-built toggle
  was added. Root correction replaced the raw native action with the shared
  `Button` (`quiet`, icon-only, dense); raw-control and all five design/foundation
  suites pass 52/52 without an allowlist exception.
