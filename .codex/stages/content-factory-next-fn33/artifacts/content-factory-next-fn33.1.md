---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task1_terra
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: settings direct navigation
public_facade: existing settings route
bounded_acceptance: production-build direct navigation without Reflect metadata errors
non_goals:
  - role visibility changes
  - production access
task_id: content-factory-next-fn33.1
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: settings production bundle repair
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: client bundle ordering judgment within frontend
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 639e3a121a803d1c5d70dd551cee65cd47687939
worktree: /home/me/code/content-factory-next
write_zone:
  - frontend root client entry
  - task focused guard
  - task artifact
success_criteria:
  - tree guard observed red then green
  - built settings direct routes have no Reflect metadata console error
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
selected_skills:
  - superpowers-test-driven-development
selected_agents:
  - worker
catalog_candidates:
  - existing reflect-metadata package
parallel_group: none
depends_on_streams:
  - none
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch stream had no separate worktree; local next start and Chromium processes ended
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - test-matrix
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: task changes bundle bootstrap and its guard only
verification:
  - focused tree guard observed RED then GREEN
  - frontend production build passed
  - Playwright direct navigation of all three settings URLs passed without metadata console errors
  - frontend TypeScript check passed
changed_files:
  - apps/frontend/src/instrumentation-client.ts
  - tests/reflect-metadata.client-boundary.guard.test.cjs
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.1.md
  - tmp/fn33.1-settings-production-proof.cjs (ignored)
  - tmp/fn33.1-settings-production-console.json (ignored)
explicit_defers:
  - none
---

# Summary

В корневой клиентский entrypoint добавлен единственный `import 'reflect-metadata'`.
Теперь загрузка клиентского дерева выполняет полифилл до любого settings-чанка,
который импортирует DTO с декораторами. Новый tree guard перечисляет frontend
исходники с DTO-импортом и удерживает этот импорт в `instrumentation-client.ts`;
в частности, он проверяет `teams.component.tsx`, где воспроизводился сбой.

# Verification

1. RED (до production-правки):

   ```sh
   PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/reflect-metadata.client-boundary.guard.test.cjs --runInBand
   ```

   Ожидаемо упал: `instrumentation-client.ts` не соответствовал
   `^import ['\"]reflect-metadata['\"];$`.

2. GREEN (после одного импорта): та же команда прошла — 1 suite, 1 test.

3. Production bundle:

   ```sh
   PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter ./apps/frontend run build:env
   ```

   Успешно: `Compiled successfully`, TypeScript завершён, 17/17 страниц
   сгенерированы; маршрут `/settings` присутствует в output.

4. Собранный frontend был запущен через `next start` на `127.0.0.1:4200`.
   Скрипт из корня репозитория использовал именно
   `/home/me/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
   `waitUntil: 'load'` и выполнил прямые переходы:

   - `/settings` — HTTP 200
   - `/settings?tab=teams` — HTTP 200
   - `/settings?tab=content_intelligence` — HTTP 200

   Полный console transcript: `tmp/fn33.1-settings-production-console.json`.
   Во всех трёх случаях единственная console-запись — информационное сообщение
   i18next; console/page errors и `Reflect.getMetadata is not a function` отсутствуют.
  Локальный сеанс неавторизован, поэтому title — `Register · Content Factory`.
  Это проверяет production bootstrap и отсутствие сбоя до auth redirect;
  авторизованное содержимое settings не утверждается как проверенное этим шагом.

5. Frontend TypeScript:

   ```sh
   PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter ./apps/frontend exec tsc --noEmit
   ```

   Завершилась с кодом 0 и без вывода.

# Assumptions and defers

- Использован существующий Next root client entrypoint `instrumentation-client.ts`;
  он уже исполняется до прикладных клиентских чанков. Внешнее или
  version-sensitive поведение не требовалось: выбор entrypoint и DTO imports
  подтверждены текущим деревом и task specification.
- `next dev` не запускался. Неавторизованный local browser proof не заменяет
  ручную проверку авторизованного `/settings` после выпуска; видимость tabs —
  отдельная задача `content-factory-next-fn33.2`.
- Отложенных пунктов нет. Beads не менялся: закрытие и приёмка принадлежат root.

# Risks / Follow-ups

Не удалять root-level import: tree guard должен оставаться зелёным. Production
проверка намеренно строилась и запускалась локально; сервер, production database,
secrets, push, merge и deploy не затрагивались.
