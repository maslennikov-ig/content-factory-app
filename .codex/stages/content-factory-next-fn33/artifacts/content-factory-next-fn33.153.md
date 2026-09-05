---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: b4-cleanup
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: экран /agents
public_facade: AgentAvailabilityGate
bounded_acceptance: в области без лимита и без ключа экран «Агент» показывает ту же строку, что раздел «Контент», и не шлёт заведомо падающий запрос
non_goals:
  - показывать остаток квоты на экране «Агент»
  - менять поведение двери /copilot/agent
evidence:
  - agent-ai-unavailable
task_id: content-factory-next-fn33.153
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: экраны ИИ честны о том, что ИИ не подключён
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: интерфейсная правка с переносом общего хука и рендер-тестом
repo: content-factory-next
branch: worktree-agent-a5ca72846a096ca1f
base_branch: wave/search-into-drafts-2026-09-05
base_commit: 1b019abd
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a5ca72846a096ca1f
write_zone:
  - apps/frontend/src/components/agents/
  - apps/frontend/src/components/copilot/
  - libraries/react-shared-libraries/src/translation/locales/
  - tests/agent-ai-unavailable.test.cjs
  - tests/copilot-*.test.cjs
success_criteria:
  - при mode=unavailable вместо приветствия стоит строка ai_allowance_unavailable
  - CopilotKit не монтируется, пока звать модель нечем
  - нечитаемый ответ двери не превращается в утверждение «ИИ не подключён»
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - AgentAvailabilityGate
parallel_group: B4
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: временная копия agent.chat.tsx в scratchpad удалена
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей не заведено, дверь /settings/ai/allowance уже в матрице
verification:
  - "pnpm exec jest tests/agent-ai-unavailable.test.cjs": passed
  - "pnpm exec jest tests/copilot tests/agent-opening-band tests/ai-allowance": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/copilot/assistant-availability.ts
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - apps/frontend/src/components/agents/agent.availability.tsx
  - apps/frontend/src/components/agents/agent.chat.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/agent-ai-unavailable.test.cjs
  - tests/copilot-lazy-mount.test.cjs
  - tests/copilot-provider.scope.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - строка про исчерпанный лимит (429) на экране «Агент» не показывается: это другое состояние и другая bead
---

# Summary

Экран «Агент» в области без включённого лимита и без ключа здоровался и обещал работу, а `POST /copilot/agent` при открытии отвечал 503 `AI_SELECTED_CREDENTIAL_UNAVAILABLE`. Ответ шёл через рантайм CopilotKit, мимо общего обработчика отказов, и на экран не попадал.

Теперь решение принимается до монтирования рантайма. Вопрос «есть ли чем звать модель» уехал из `copilot.provider.tsx` в отдельный модуль `assistant-availability.ts` — тот же ответ, та же дверь `/settings/ai/allowance` (она отвечает `unavailable` ровно при том условии, при котором дверь помощника отвечает 503), но без зависимости от `@copilotkit/*`, которая экрану для этого решения не нужна. `AgentAvailabilityGate` показывает `RestrictedState` со строкой `ai_allowance_unavailable` — той самой, что говорит раздел «Контент», — и `CopilotKit` в дерево не попадает вовсе.

Про повторный запрос: SWR стоит с `revalidateOnFocus: false` и с тем же ключом, что строка остатка, поэтому дверь квоты спрашивается один раз (проверено в тесте счётчиком вызовов). Запросов к `/copilot/agent` при недоступном ИИ теперь ноль — в тесте это отдельное утверждение.

# Scope / Routing

Зона записи — экран агента, модуль помощника, локали и их тесты. Ответ двери разложен на четыре состояния: `checking` (тихая строка «Проверяем, подключён ли ИИ…»), `available`, `unavailable` (честная строка), `unknown` — дверь не ответила. Последнее намеренно НЕ превращается в «ИИ не подключён»: про подключение мы в этом случае ничего не узнали, поэтому разговор открывается и, если звать модель всё-таки нечем, откажет сервер.

# Verification

- `pnpm exec jest tests/agent-ai-unavailable.test.cjs` — новый набор, 6/6. До правки: рендер-тесты проверяют компонент, которого не было, а страж «CopilotKit стоит внутри проверки» на прежнем `agent.chat.tsx` красный (проверено откатом файла: 1 failed, 5 passed).
- `pnpm exec jest tests/copilot tests/agent-opening-band tests/ai-allowance` — 73/73.
- `pnpm exec jest` по пяти стражам дизайна и локалей + `tests/design.typography.test.cjs` — 62/62.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 ошибок.

Два существующих стража (`copilot-lazy-mount`, `copilot-provider.scope`) были прибиты к `copilot.provider.tsx` построчно и покраснели от переезда хука. Правило то же, файл другой — стражи перенацелены на новый модуль, а не ослаблены; вдобавок они теперь требуют, чтобы «ещё не знаем» и «дверь не ответила» оставались двумя разными ответами.

# Delivery / Cleanup

Коммит на ветке потока, не влит, не отправлен.

# Risks / Follow-ups / Explicit Defers

Исчерпанный включённый лимит (429, `mode: included` с `remaining <= 0`) экран «Агент» по-прежнему не проговаривает: разговор откроется, и человек узнает об исчерпании из отказа. Это другое состояние и другая правда, чем «не подключён»; отдельной bead не заводил — состояние честно отдаёт сервер.
