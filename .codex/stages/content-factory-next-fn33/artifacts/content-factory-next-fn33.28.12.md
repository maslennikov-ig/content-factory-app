---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: нижний ряд контролов окна «Создать пост»
public_facade: n/a
bounded_acceptance: jest-editorial-stage-frontend-controls + jest-compose-window-only-useful
non_goals:
  - фильтр этапа в календаре (другой контрол, другая поверхность)
  - новый значок «этап» в наборе — это решение дизайна, а не починка
evidence:
  - jest-editorial-stage-frontend-controls
task_id: content-factory-next-fn33.28.12
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: один ряд — одна геометрия
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: перевод контрола на примитив с сохранением договора о значениях
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - tests/**
success_criteria:
  - этап нарисован тем же примитивом Menu, что тег и повтор
  - одна форма указателя и один кегль на весь ряд
  - пять выборов и отчёт null за «этап не записан» сохранены
  - реестры design-geometry/typography не расширены
selected_docs:
  - docs/design/component-authoring-rules.md
  - libraries/react-shared-libraries/src/choice/choice.menu.tsx
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - stream-B
parallel_decision: sequential
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
docs_impact: refactor
docs_reviewed: no-change-needed
docs_review_notes: значения и договор поля не менялись, менялся только рисунок контрола
verification:
  - "pnpm exec jest jest-editorial-stage-frontend-controls": passed
  - "pnpm exec jest jest-compose-window-only-useful": passed
  - "pnpm exec jest jest-design-guard jest-design-contrast jest-design-typography jest-foundation": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - jest-editorial-stage-frontend-controls
  - jest-compose-window-only-useful
explicit_defers:
  - значка слева у этапа нет; значка со смыслом «этап» в наборе не существует, а файл значков вне зоны записи
---

# Summary

Этап в ряду «тег / повтор / этап» рисует продукт, а не браузер.

Рамка, высота, радиус и фон у трёх контролов совпадали и раньше — измерено в
браузере. Расходилось ровно то, что рисует не продукт: у этапа стоял нативный
`select` с `appearance: auto`, браузерной стрелкой другой формы и толщины и
текстом 14px против 13px у соседей.

Контрол переписан на тот же примитив `Menu` / `MenuButton` / `MenuList` /
`MenuOption`, что поток B дал тегу и повтору, с той же анатомией кнопки: тот же
`cf-label-md`, тот же `DropdownArrowIcon size={12} rotated={isOpen}`, тот же
`useClickOutside`, тот же список `w-[240px]` над кнопкой.

Договор поля не тронут. Пять выборов в прежнем порядке, «этап не записан»
по-прежнему стоит первым и по-прежнему сообщается как `null`, а не как пустая
строка.

# Scope / Routing

**Отклонение, названное вслух: значка слева нет.** У соседей он есть, и bead
это как расхождение называет. Значка со смыслом «этап» в наборе
(`apps/frontend/src/components/ui/icons/index.tsx`) не существует, а взять
чужой — календарь или часы — значило бы приписать полю смысл даты, которого у
него нет. Завести новый значок нельзя дважды: файл значков вне зоны записи, и
новый глиф — это решение дизайна, а не починка расхождения. Остальные три
измеренные разницы (форма указателя, его толщина, кегль) сняты полностью.

**Реестры не расширены.** `design-geometry` остался 1006, `typography` — 757, в
точности те числа, что назвала рецензия волны. Записей про
`editorial-stage.select.tsx` в них не было и не появилось: новый контрол
проходит стражей без единого исключения.

# Verification

Красное до правки: 5 падений из 10 в
`tests/editorial-stage.frontend-controls.test.cjs`. После правки 10/10.

Проверки переписаны с `select`/`option` на примитив и спрашивают у контрола то
же, что спрашивали раньше: пять выборов в порядке, отчёт значением, `null` за
пустой выбор. Добавлены две новые — что нативного `select` в контроле нет вовсе
и что кегль с указателем у всего ряда одни.

В `tests/compose-window-only-useful.test.cjs` перевёрнута строка потока B
«этап был нативным `Select` и им остаётся»: теперь ряд проверяется одним
циклом по трём файлам, и отдельно — что нативного выбора в нём не осталось.

Дизайн-стражи (`design.guard`, `design.contrast`, `design.typography`,
`foundation`) и все шесть наборов `editorial-stage.*` зелёные. `tsc --noEmit` по
фронтенду — ноль.

# Risks / Follow-ups / Explicit Defers

- Значок слева у этапа отсутствует — единственная оставшаяся разница в ряду.
  Если владелец захочет его, нужен новый глиф в наборе значков и отдельная
  задача на файл вне этой зоны.
- Фильтр этапа в календаре (`editorial-stage.filter.tsx`) остаётся нативным
  `select`. Он стоит не в этом ряду и в bead не назван; трогать его без повода
  значило бы расширить задачу.
