---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-C
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: CopilotProvider — единственная дверь, за которой поднимается <CopilotKit>
bounded_acceptance: tests/copilot-lazy-mount.test.cjs, tests/copilot-provider.scope.test.cjs, tests/copilot-textarea.fallback.test.cjs, tsc frontend
non_goals:
  - подписи панели помощника (их чинит другой поток)
  - помощник на других экранах (подписи, автопостинг, дополнения)
evidence:
  - jest-copilot-lazy-mount
  - jest-copilot-scope
  - tsc-frontend
task_id: content-factory-next-fn33.99
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: перенос монтирования затрагивает состояние всего окна
repo: content-factory-next
branch: worktree-agent-a4826acfd11be4024
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4826acfd11be4024
write_zone:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - tests/copilot-lazy-mount.test.cjs
success_criteria:
  - открытие окна поста не поднимает провайдера и не шлёт availableAgents
  - кнопка вызова помощника остаётся и открывает окно помощника одним нажатием
  - AssistedTextarea без провайдера остаётся обычным полем
selected_docs:
  - node_modules/@copilotkit/react-ui@1.10.6 (Modal.d.ts, defaultOpen)
  - docs/prompts/compose-modal-design-brief.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-C
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - ui
  - user-flow
  - state-transition
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: продолжение уже записанного решения fn33.48/fn33.93, новых правил нет
verification:
  - pnpm exec jest tests/copilot-lazy-mount.test.cjs tests/copilot-provider.scope.test.cjs tests/copilot-textarea.fallback.test.cjs tests/copilot.controller.test.cjs tests/compose-window-only-useful.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - tests/copilot-lazy-mount.test.cjs
explicit_defers:
  - none
---

# Summary

Провайдер помощника поднимается по нажатию, а не по открытию окна поста.
`@copilotkit/react-core@1.10.6` шлёт `availableAgents` на монтировании
безусловно, поэтому «открыть окно поста» стоило запроса — у пространства с
настроенным поставщиком моделей платного — каждому, кто просто пишет пост.

Кнопка помощника осталась и стоит в нижнем ряду окна рядом с тегом, повтором и
этапом — обычный `Button` варианта `quiet` с уже существующим ключом
`your_assistant`. Она появляется только там, где помощнику есть чем ответить:
доступность спрашивается той же дверью остатка квоты, что и у провайдера
(`useAssistantAvailable` вышел из провайдера наружу, ключ SWR тот же — один
запрос на двоих). Нажатие поднимает провайдера и сразу открывает окно
помощника (`defaultOpen`), иначе человек нажал бы кнопку и увидел вторую.

# Scope / Routing

Подписи самой панели `CopilotPopup` не трогались — их держит другой поток.
Изменено только то, **когда** она монтируется.

Подъём провайдера пересобирает поддерево окна, поэтому два значения переехали
выше провайдера в `ManageModal`: «подтверждения проверены»
(`contextReviewedAt`) и открытые настройки канала (`showSettings`). Первое —
вопрос правильности: без переноса подъём помощника снова закрыл бы
планирование посту, у которого проверка уже записана на сервере. Остальное окно
живёт в общем хранилище `store.ts`, которому дерево React не указ.

`defaultOpen` проверен по установленному пакету
(`@copilotkit/react-ui@1.10.6`, `components/chat/Modal.d.ts` и сборка:
`useState(defaultOpen)`), а не по внешнему источнику.

# Verification

Новый страж `tests/copilot-lazy-mount.test.cjs` до правки был красным на 4 из 6
проверок (провайдер в безусловном возврате, нет кнопки, нет `defaultOpen`, нет
вопроса о доступности); после правки зелёный. Целевые наборы и `tsc` — зелёные.

# Delivery / Cleanup

Возвращено корню на слияние.

# Risks / Follow-ups / Explicit Defers

Открытие помощника один раз пересобирает поддерево окна: текст, вложения, дата
и каналы живут в хранилище и переживают это, а история отмены редактора и
позиция курсора — нет. Ровно та же пересборка происходила и раньше, при ответе
двери остатка квоты, но теперь она приходится на нажатие человека, а не на
первые миллисекунды после открытия. Живым прогоном не проверено: стенд главной
копии собран из другого дерева.
