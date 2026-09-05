---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост»
public_facade: n/a
bounded_acceptance: jest-copilot-provider-scope
non_goals:
  - английские подписи помощника и «Powered by CopilotKit» (fn33.118)
  - экраны подписи, автопостинга и заглушек — их файлы вне зоны записи
evidence:
  - jest-copilot-provider-scope
task_id: content-factory-next-fn33.28.11
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: окно поста не шумит в сеть и в консоль
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: условие монтирования затрагивает договор между провайдером и его потребителями
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/copilot/**
  - apps/frontend/src/components/new-launch/**
  - tests/**
success_criteria:
  - без доступного помощника POST /copilot/chat не уходит при открытии окна
  - доступность спрашивается один раз через уже существующую дверь
  - потребители под провайдером не падают, когда провайдера нет
selected_docs:
  - node_modules/@copilotkit/react-core@1.10.6 (прочитан dist: useCopilotContext бросает без провайдера)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - none
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - ui
  - user-flow
  - api
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: новых дверей нет; поведение существующей обёртки сужено
verification:
  - "pnpm exec jest jest-copilot-provider-scope": passed
  - "pnpm exec jest jest-copilot-controller jest-compose-window-only-useful": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - jest-copilot-provider-scope
explicit_defers:
  - экраны signatures.component.tsx, autopost.tsx, plug.tsx продолжают поднимать помощника безусловно — их файлы вне зоны записи, нужна отдельная задача
---

# Summary

Помощник больше не бьётся о 503 при каждом открытии окна поста.

Библиотека `@copilotkit/react-core@1.10.6` шлёт `availableAgents` на
монтировании провайдера безусловно, поэтому «не слать запрос» и «не монтировать
провайдер» — одно и то же решение. `CopilotProvider` получил признак
`requireAvailable`: с ним он сперва спрашивает доступность и поднимает
`<CopilotKit>` только тогда, когда помощника действительно можно позвать.

Доступность берётся у уже существующей двери `GET /settings/ai/allowance` — той
же, что печатает строку остатка, и с тем же ключом SWR, так что на экране с
обеими это один запрос, а не два. Дверь отвечает `unavailable` ровно при том
условии, при котором `/copilot/chat` отвечает 503: у выбранного режима нет
ключа (`fn33.28.9`). Пока ответа нет, обёртки тоже нет — провайдер, поднятый «на
всякий случай», и есть тот самый запрос.

Потребители под провайдером научились жить без него. `useCopilotContext`
библиотеки бросает исключение, когда провайдера нет, поэтому:

- панель `CopilotPopup` в `manage.modal.tsx` рисуется под
  `useHasCopilotProvider()` — обещать собеседника, которого нет, незачем;
- хуки `useCopilotReadable` и `useCopilotAction` уехали из тела `editor.tsx` в
  отдельный узел `EditorCopilotBridge`, который ничего не рисует и появляется
  только под поднятым провайдером. Хуки не бывают условными; условие законно
  только на узле.

# Scope / Routing

**Отклонение от «Сделать:», названное вслух.** Bead просил проверку
доступности у провайдера. Сделано признаком `requireAvailable`, а не поведением
по умолчанию, и причина не в осторожности, а в зоне записи: три поверхности вне
её — `settings/signatures.component.tsx`, `autopost/autopost.tsx`,
`plugs/plug.tsx` — рисуют `CopilotTextarea` прямо под провайдером. Без
`<CopilotKit>` над ним `useCopilotContext` бросает
«Remember to wrap your app in a `<CopilotKit>`» (прочитано в `dist` пакета,
строка 209). Включить проверку для них значило бы уронить три экрана в файлах,
которые мне править нельзя и которые я не могу проверить.

Поэтому окно поста починено полностью, а остальным трём нужна отдельная задача:
сперва развести в них хуки и `CopilotTextarea` так же, как здесь, потом
поставить признак. Признак задокументирован в самом провайдере именно этим
текстом, чтобы следующий не принял его за украшение.

# Verification

Красное до правки: 7 падений из 16 в `tests/copilot-provider.scope.test.cjs`.
После правки 16/16.

Существующая проверка «монтирует провайдер сам» ослаблена ровно на длину
признака: `<CopilotProvider>` → `<CopilotProvider[\s>]`. Смысл её не изменился —
она про то, поднимает ли поверхность помощника сама.

`tsc --noEmit` по фронтенду — ноль. `copilot.controller` и
`compose-window-only-useful` зелёные.

# Risks / Follow-ups / Explicit Defers

- **Отдельная задача:** перевести `signatures.component.tsx`, `autopost.tsx` и
  `plug.tsx` на `requireAvailable`. Сегодня они по-прежнему дают 503 при
  открытии у пространства без ключа AI.
- Нечитаемый ответ двери считается «нельзя»: помощник не поднимется при сбое
  сети на `/settings/ai/allowance`. Это осознанно — запрос, который заведомо
  упадёт, хуже отсутствующей панели, — но владельцу стоит это подтвердить.
- Проверка живёт на исходниках, а не на рендере: JSDOM с CopilotKit в этом
  дереве не поднят ни одним набором, и заводить его ради одного условия
  дороже, чем оно стоит.
