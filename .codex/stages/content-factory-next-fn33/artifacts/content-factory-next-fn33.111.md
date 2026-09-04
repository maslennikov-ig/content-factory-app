---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/brand-voice.materials-tab.test.cjs, tests/brand-voice.materials.test.cjs, design guards, tsc frontend
non_goals:
  - место, где печатается отказ (это content-factory-next-fn33.69)
  - изменение маршрутов перекроя и черновика на сервере
evidence:
  - none
task_id: content-factory-next-fn33.111
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: выбор площадки по умолчанию затрагивает три файла и порядок ответов двух запросов
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - apps/frontend/src/components/brand-voice/voice-materials.adapter.ts
  - apps/frontend/src/components/brand-voice/voice-materials.container.tsx
  - apps/frontend/src/components/brand-voice/voice-materials.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/brand-voice.materials-tab.test.cjs
success_criteria:
  - окно перекроя открывается на первой площадке, у которой в этой области есть канал
  - без единого канала «Переиспользовать» выключено и рядом написано почему
  - «Открыть в редакторе» выключено, если у выбранной площадки канала нет
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-r
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
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
docs_review_notes: поведение экрана, карта раздела его не описывает поимённо
verification:
  - pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed
  - pnpm exec jest tests/brand-voice.materials.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/brand-voice/voice-materials.adapter.ts
  - apps/frontend/src/components/brand-voice/voice-materials.container.tsx
  - apps/frontend/src/components/brand-voice/voice-materials.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/brand-voice.materials-tab.test.cjs
explicit_defers:
  - content-factory-next-fn33.69: отказ по-прежнему печатается вверху блока, а кнопка стоит ниже — это отдельная задача
---

# Summary

Окно перекроя больше не открывается на площадке, в которую нельзя положить черновик. Площадку по умолчанию выбирает `preferredRecutPlatform` — первая площадка, у которой в этой области есть включённый канал. Если список каналов ещё не пришёл, нажатие запоминается и перекройка начинается сразу, как ответ придёт: одна просьба к серверу вместо просьбы за неверную площадку и отказа после неё. Если канала нет нигде, «Переиспользовать» выключено и над таблицей написано, почему и что сделать.

Побочно закрыты две мелочи из того же отчёта: площадка без канала больше не красится как выбранная (было «выключено и выбрано одновременно»), а «Открыть в редакторе» выключается, если у площадки в окне канала нет — на случай, когда список каналов пришёл уже после открытия окна.

# Scope / Routing

Зона записи — четыре файла brand-voice и их набор тестов. `voice-copy.ts` — собственный словарь раздела (ru/en), общих ключей локалей эта правка не трогает, поэтому 16 файлов переводов не менялись.

# Verification

Красный до правки: `the panel opens on a platform this workspace can post to` падал с `platform: "site"` вместо `telegram`. После правки набор зелёный, четыре прогона подряд без плавающих отказов.

# Delivery / Cleanup

Ветка потока, коммит на ней. Слияние — за корнем.

# Risks / Follow-ups / Explicit Defers

Помощнику `renderTab` в наборе добавлено ожидание списка каналов: теперь порядок двух ответов виден в тестах, и обращения к окну идут через `openRecut`, который ждёт панель. Это правка теста, поведение прежнее.
