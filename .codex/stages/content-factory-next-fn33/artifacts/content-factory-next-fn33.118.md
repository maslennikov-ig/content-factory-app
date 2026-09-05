---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: n/a
bounded_acceptance: tests/assistant-panel-language.test.cjs, tests/copilot-provider.scope.test.cjs
non_goals:
  - окно чата с агентом (`agent.chat.tsx`) — другая поверхность
  - остальной new-launch: зона другого потока
evidence:
  - assistant-panel-language-suite
  - copilot-provider-scope-suite
task_id: content-factory-next-fn33.118
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: доступность панели помощника и договор с версией библиотеки
repo: content-factory-next
branch: worktree-agent-aa746f278ef2c6425
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa746f278ef2c6425
write_zone:
  - apps/frontend/src/components/copilot/assistant.popup.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx (только узел CopilotPopup)
  - apps/frontend/src/app/global.scss
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/assistant-panel-language.test.cjs
  - tests/copilot-provider.scope.test.cjs
success_criteria:
  - aria-label всех кнопок панели приходят через t()
  - ярлыки сообщений и поля ввода переведены целиком
  - «Powered by CopilotKit» не показывается
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-L2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: разбор версии библиотеки записан в самом компоненте
verification:
  - pnpm exec jest tests/assistant-panel-language.test.cjs: passed
  - pnpm exec jest tests/copilot-provider.scope.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/copilot/assistant.popup.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/app/global.scss
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/assistant-panel-language.test.cjs
  - tests/copilot-provider.scope.test.cjs
explicit_defers:
  - none
---

# Summary

Версия читалась из `node_modules/@copilotkit/react-ui@1.10.6`, не по памяти. Она переводится двумя дверями, и нужны обе.

Проп `labels` — штатная дверь; через него теперь идут `placeholder`, `stopGenerating`, `regenerateResponse`, `copyToClipboard`, `copied`, `thumbsUp`, `thumbsDown`, `error`, а не только заголовок и приветствие.

Кнопка вызова и крестик в шапке несут строки, вшитые в разметку библиотеки: `Button.tsx` пишет `aria-label={open ? "Close Chat" : "Open Chat"}`, `Header.tsx` — `aria-label="Close"`, пропа для них нет. Штатная дверь здесь другая: `Button` и `Header` — пропы `CopilotModalProps`, которыми ставят свои узлы. `AssistantPopup` их и ставит, с той же разметкой и теми же классами, на которых держатся стили библиотеки; заодно у кнопок появились `type="button"` и `aria-expanded`.

Пропа `showResponseButton` в этой версии нет вовсе, а «Powered by CopilotKit» пропом не убирается: `Input.tsx` считает её видимость как `!copilotApiConfig.publicApiKey` — то есть показывает всем, у кого нет ключа облака CopilotKit. Ключ выдумывать нельзя, поэтому строка спрятана правилом в `global.scss`, рядом с остальными правилами помощника; библиотека пишет `display`/`visibility` в атрибут `style`, поэтому правило перебивает их через `!important`.

Страж `copilot-provider.scope` обновлён под новое имя узла и знает, что панель — не потребитель, который решает, поднимать ли провайдер: условие `hasCopilot` осталось у окна поста, и проверка это по-прежнему держит.

# Scope / Routing

Зона записи и критерии — в заголовке. Документация: внешних источников не требовалось; версия `@copilotkit/react-ui` читалась из `node_modules` этого дерева, остальное — код репозитория. Навыки, агенты и кандидаты каталога не выбирались.

# Verification

Команды и результат перечислены в поле `verification`. Полный `pnpm test` не запускался: волна это запрещает.

# Delivery / Cleanup

Коммит на ветке потока `worktree-agent-aa746f278ef2c6425`. Ветка остаётся до слияния корнем; `bd close` корень делает одной партией.

# Risks / Follow-ups / Explicit Defers

- none
