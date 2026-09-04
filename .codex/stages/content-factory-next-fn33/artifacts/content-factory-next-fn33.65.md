---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-o-assistant-refusal-devindicator
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: every screen that awaits the shared fetch helper
public_facade: libraries/helpers/src/utils/custom.fetch.func.ts
bounded_acceptance: a refused request settles, so the form that awaited it unlocks
non_goals:
  - giving the backend refusals a code
  - changing which refusals open the global modal
evidence:
  - none
task_id: content-factory-next-fn33.65
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: a refused save releases its form
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: shared plumbing read by every screen; the blast radius had to be reasoned about
repo: content-factory-next
branch: worktree-agent-a6c1bdd0574883665
base_branch: wave/fixes-2026-09-04
base_commit: 70fb3eaf20d77d8754fb5c4d12cee1e9082065ba
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c1bdd0574883665
write_zone:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - apps/frontend/src/components/layout/layout.context.tsx
  - tests/fetch-refusal-settles.test.cjs
  - tests/role.refusal.test.cjs
success_criteria:
  - the promise returned by the shared fetch helper always settles
  - the response body is still readable by the caller after the global handler read it
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: medium
risk_tags:
  - user-flow
  - ui
  - api
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: no documented contract changed; a hang became an answer
verification:
  - "pnpm exec jest tests/fetch-refusal-settles.test.cjs": passed
  - "pnpm exec jest tests/role.refusal.test.cjs": passed
  - "pnpm exec jest tests/logged-auth.route-scope.test.cjs tests/role-refusal-localized.test.cjs tests/posts.save-refusal.test.cjs tests/settings-tab-address.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
changed_files:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/fetch-refusal-settles.test.cjs
  - tests/role.refusal.test.cjs
explicit_defers:
  - the backend policy refusals still carry no code, so they open the global modal instead of being drawn by the screen; that is the fix commit 961705d6 started and it stays open
---

# Summary

Отказ больше не подвешивает кнопку.

`custom.fetch.func.ts` на «этот ответ уже обработан» возвращал
`new Promise((res) => {})` — промис без `resolve` и без `reject`. Ожидание
вызывающего кода не завершалось никогда, `finally` не срабатывал, и кнопка
навсегда оставалась в состоянии «Сохраняем…». Так вело себя любое место
продукта на 403 без `code`, а также на 406 и 402.

Теперь ответ возвращается всегда, а общему обработчику уходит копия ответа.
Копия важна: `layout.context.tsx` читает тело отказа, чтобы показать модалку, и
без копии вызывающий код получил бы ответ с уже вычерпанным телом и упал бы на
`.json()`. Это чинит заодно и ветку 403 с `code`, где отказ и раньше уходил
экрану — с пустым телом.

`layout.context.tsx` не менялся: модалка показывается как прежде, вызывающий код
получает ответ с `ok === false` и сам решает, показывать ли что-то поверх.

# Scope / Routing

Зона записи — общий помощник запроса, ветка отказов в `layout.context.tsx` (не
понадобилась) и тесты. Внешняя документация не нужна: и `Response.clone()`, и
поведение промиса — язык и платформа, а не версия зависимости.

# Verification

`tests/fetch-refusal-settles.test.cjs` написан первым: до правки 2 из 3
проверок красные («никогда не завершился»), после — зелёные. Набор
`tests/role.refusal.test.cjs` прогоняет отказы через настоящий обработчик; он
был красным ещё до этой правки (4 упавших: не хватало заглушки `i18next` после
перевода отказов) и возвращён в зелёное — иначе главную ветку моей правки никто
не проверял.

# Delivery / Cleanup

Коммит `отказ отпускает кнопку, а не подвешивает её навсегда` на ветке потока.

# Risks / Follow-ups / Explicit Defers

- Экран, который рисует свой отказ, теперь может показать и общую модалку, и
  своё сообщение. Раньше он не показывал ничего и висел; если такое встретится
  на прогоне, это отдельная мелочь.
- Отказы политики на бэкенде по-прежнему без `code`, поэтому они идут модалкой,
  а не состоянием `restricted` на экране. Это открытая часть замысла коммита
  `961705d6`.
