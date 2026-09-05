---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-E-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: экраны подписей, автопостинга и дополнений
public_facade: apps/frontend/src/components/copilot/assisted.textarea.tsx
bounded_acceptance: jest-copilot-textarea-fallback
non_goals:
  - английские подписи самого помощника и «Powered by CopilotKit» (fn33.118)
  - окно чата с агентом: у него свой рантайм и своя обёртка
evidence:
  - jest-copilot-textarea-fallback
task_id: content-factory-next-fn33.28.16
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: помощник не зовётся там, где ответить нечем
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: договор между провайдером и его потребителями — три экрана падали бы без него
repo: content-factory-next
branch: worktree-agent-a04a06f6c9f480bbb
base_branch: wave/compose-2026-09-04
base_commit: 411ed4bf0e7c8f29a40f756970a3fbfcde11bdb1
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a04a06f6c9f480bbb
write_zone:
  - apps/frontend/src/components/settings/signatures.component.tsx
  - apps/frontend/src/components/autopost/**
  - apps/frontend/src/components/plugs/**
  - apps/frontend/src/components/copilot/**
  - tests/**
success_criteria:
  - без ключа AI открытие трёх экранов не даёт POST /copilot/chat -> 503
  - поле остаётся рабочим полем ввода, а не исчезает и не падает
  - под доступным помощником поведение прежнее
selected_docs:
  - node_modules/@copilotkit/react-textarea (CopilotTextarea требует поднятого <CopilotKit>)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - stream-D-compose-2026-09-04
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
docs_review_notes: новых дверей и ролей нет; сужено поведение существующей обёртки
verification:
  - "pnpm exec jest jest-copilot-textarea-fallback (до правки)": failed
  - "pnpm exec jest jest-copilot-textarea-fallback": passed
  - "pnpm exec jest jest-copilot-provider-scope jest-compose-window-only-useful": passed
  - "pnpm exec jest jest-design-guard jest-design-contrast jest-foundation": passed
  - "pnpm exec jest jest-shared-form-control-contract jest-autopost-generation jest-autopost-language-default jest-autopost-research-enrichment jest-settings-tab-address": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/copilot/assisted.textarea.tsx
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - apps/frontend/src/components/autopost/autopost.tsx
  - apps/frontend/src/components/plugs/plug.tsx
  - jest-copilot-textarea-fallback
explicit_defers:
  - none
---

# Summary

`content-factory-next-fn33.28.11` научил окно поста не поднимать помощника без
ключа AI, но признак `requireAvailable` достался только ему. Подписи,
автопостинг и дополнения рисовали `CopilotTextarea` прямо под провайдером, а он
без `<CopilotKit>` бросает исключение библиотеки, — поэтому провайдера они
просили безусловно, и каждое открытие стоило `POST /copilot/chat -> 503`.

Приём тот же, что в окне поста: условие переезжает с хука на узел. Поле уехало
за `AssistedTextarea` — под поднятым провайдером это прежнее поле помощника, без
него обычное поле ввода с тем же значением, подписью и оформлением. Класс
приходит снаружи, поэтому обеим веткам достаётся один и тот же; своих цветов у
узла нет вовсе.

Один узел на три экрана, а не три копии одного решения: разъехавшись, копии
разъехались бы молча — сломанной выглядела бы не разметка, а помощник.
`w-full` у обычного поля — не украшение: `CopilotTextarea` рисует блок и
занимает ширину сам, а у родного `<textarea>` ширина считается в символах.

# Scope / Routing

`copilot/**` тронут ровно потому, что признака `requireAvailable` не хватало:
без узла-моста флаг у этих трёх экранов означал бы падение, а не тишину. В
`copilot.provider.tsx` обновлено только пояснение к признаку — оно обещало эти
три экрана отдельной задачей, и это обещание исполнено.

# Verification

Новый страж `tests/copilot-textarea.fallback.test.cjs` показан красным до
правки (вместе со стражем `.15` — 14 из 14 упавших), после правки зелёный.
Остальные команды — в поле `verification`.

# Delivery / Cleanup

Возвращено корню на слияние; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

Проверка статическая: она доказывает дорогу решения, а не пиксели. Живой прогон
по трём экранам без ключа AI — за владельцем на ближайшем ручном тестировании,
там же видно, что обычное поле выглядит полем.
