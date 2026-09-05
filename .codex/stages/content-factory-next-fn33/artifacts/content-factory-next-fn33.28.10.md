---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост»
public_facade: n/a
bounded_acceptance: jest-compose-window-only-useful
non_goals:
  - значок creationMethod в календаре и предпросмотре — там он говорит правду
evidence:
  - jest-compose-window-only-useful
task_id: content-factory-next-fn33.28.10
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: человеческие подписи окна поста
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: три подписи в трёх файлах, две из них вне зоны записи
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/new-launch/**
  - tests/**
success_criteria:
  - сырое значение перечисления не стоит на первом экране окна
  - значок остаётся там, где он различает настоящие источники
selected_docs:
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: blocked
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
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: значок остаётся в продукте, изменилось только место показа
verification:
  - "pnpm exec jest jest-compose-window-only-useful": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - jest-compose-window-only-useful
explicit_defers:
  - "«ИИ Image»: apps/frontend/src/components/launches/ai.image.tsx:191 — вне зоны записи"
  - "«browse files»: строка Uppy Dashboard, лечится в apps/frontend/src/components/media/media.component.tsx — вне зоны записи"
  - "шестнадцатеричные литералы значка: apps/frontend/src/components/launches/creation.method.badge.tsx — вне зоны записи"
---

# Summary

Из трёх пунктов bead сделан один: тот, что попадает в зону записи.

**Сделано — значок «WEB».** Это была метка `creationMethod`, и она печатала
сырое значение перечисления как есть, с английской подсказкой «Created via
WEB». Человеку, открывшему собственное окно поста, слово «WEB» не сообщает
ничего: он и так знает, что пишет пост в браузере, потому что прямо сейчас это
и делает. Значок снят с первого экрана окна, как bead и просил.

Из продукта он не удалён и трогать его не пришлось: в календаре и в
предпросмотре тот же значок различает посты, пришедшие из API, MCP и
автопостинга, и там это настоящий факт о записи. Убран он ровно оттуда, где
всегда показывал одно и то же.

**Не сделано — «ИИ Image» и «browse files».** Оба вне зоны записи; остановился
на них, как велят общие правила потока.

# Scope / Routing

Точные адреса и готовый диагноз для того, кто возьмёт остаток:

1. **«ИИ Image»** — `apps/frontend/src/components/launches/ai.image.tsx:191`:
   `{t('ai', 'AI')} Image`. Половина строки идёт через локали, половина зашита
   в разметке, поэтому по-русски выходит «ИИ Image». Нужен один ключ на всю
   подпись (рядом уже есть `generate_ai_image` на строке 136), а не склейка
   переведённого слова с непереведённым.

2. **«browse files»** — своей строки в дереве нет вовсе: это собственная
   английская подпись `@uppy/react` Dashboard. Правится передачей `locale`
   (или `locale.strings.browseFiles`) в `Dashboard` —
   `apps/frontend/src/components/media/media.component.tsx:565` — либо в
   `useUppyUploader` (`apps/frontend/src/components/media/new.uploader.tsx:162`).
   Uppy держит свой словарь отдельно от i18next, так что шестнадцать локалей
   продукта его не покрывают: понадобится либо словарь Uppy на язык, либо
   передача одной строки из `t()`.

3. **Попутная находка bead** — `creation.method.badge.tsx` красит значок
   шестнадцатеричными литералами (`#6b7280`, `#2563eb`, `#9333ea`, `#d97706`,
   `#0f766e`) вместо токенов `cf`. Файл вне зоны; значок при этом продолжает
   жить в календаре и предпросмотре, так что расхождение с
   `component-authoring-rules.md` остаётся и требует отдельной задачи. Стражи
   дизайна его сегодня пропускают, потому что файл в их реестре
   grandfathered — то есть молча он не исчезнет, но и не починится.

# Verification

Красное до правки: 1 падение из 10 в
`tests/compose-window-only-useful.test.cjs`. После правки 10/10.

Две новые проверки: значка нет в окне, и он же по-прежнему стоит в календаре и
предпросмотре — вторая нужна, чтобы «убрали с первого экрана» не превратилось
однажды в «удалили из продукта».

`tsc --noEmit` по фронтенду — ноль.

# Risks / Follow-ups / Explicit Defers

- Два из трёх пунктов bead не закрыты: файлы вне зоны записи. Bead закрывать
  нельзя, пока «ИИ Image» и «browse files» не переведены.
- Шестнадцатеричные литералы в значке остаются.
