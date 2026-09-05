---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-R
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: читатель набора тестов календаря
public_facade: the calendar-card guard is named for what it checks: four class decisions, not geometry
bounded_acceptance: имя файла, заголовок и названия проверок не обещают геометрию
non_goals:
  - Playwright-снимок карточки не делается (дешёвый вариант из bead)
  - поведение проверок не меняется — ни одна не добавлена и не убрана
evidence:
  - calendar-card-class-decisions-green
task_id: content-factory-next-th1s
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: тест называется тем, что он делает
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: переименование и честный заголовок, риска в поведении нет
repo: content-factory-next
branch: worktree-agent-a8d545339d966d08f
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8d545339d966d08f
write_zone:
  - tests/calendar-card-*.cjs
success_criteria:
  - имя файла не содержит fit
  - заголовок прямо говорит, что проверяются имена классов, а не пиксели
  - названия describe/test не обещают удержанную геометрию
  - набор остаётся зелёным, состав проверок не изменился
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: ничего временного в дереве не осталось
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: ссылок на старое имя в docs/, AGENTS.md, CLAUDE.md и handoff нет; оно встречается только в журналах прогонов .codex/stages/**/evidence — это записи о состоявшихся прогонах, их не переписывают
verification:
  - "pnpm exec jest tests/calendar-card-class-decisions.guard.test.cjs": passed
changed_files:
  - tests/calendar-card-fit.guard.test.cjs -> tests/calendar-card-class-decisions.guard.test.cjs
explicit_defers:
  - "content-factory-next-th1s: Playwright-снимок карточки на 320/390/1440 не сделан — bead предлагает его как альтернативу, выбран дешёвый вариант; причина, по которой снимок всё-таки стоит рассмотреть, записана в заголовке файла"
---

# Summary

`tests/calendar-card-fit.guard.test.cjs` → `tests/calendar-card-class-decisions.guard.test.cjs`.

Файл читал два исходника как текст и матчил имена классов, а назывался `fit` —
и заголовок коммита `79127f23` читается как удержанная геометрия. Аудит
02.09.2026 (пункт 17) на это указал. Теперь имя, заголовок и названия проверок
говорят то, что файл делает.

Заголовок первым абзацем прямо перечисляет, что из этого следует, когда набор
зелёный: переполнение от изменившегося токена шрифта, шага отступов или ширины
контейнера он не увидит, а перенос `className` на другую строку или вынос в
помощник даст ложный красный — чинить надо шаблон, а не компонент. Там же
записано, почему Playwright-снимок не сделан, а не просто пропущен.

Поведение не тронуто: одиннадцать проверок, те же самые, тот же порядок.
Переименованы девять названий `describe`/`test`, обещавших геометрию или
поведение («не рисуется за пределами карточки», «слот остаётся такой же
высоты») — вместо них названо то, что действительно проверяется («класс
объявляет `min-w-0`», «класс объявляет `shrink-0`»).

# Scope / Routing

Внешняя документация не нужна: правка целиком локальная — переименование файла
и текст в нём.

# Verification

`pnpm exec jest tests/calendar-card-class-decisions.guard.test.cjs` — 11 из 11
зелёных, состав совпадает с прогоном до переименования. Красного шага здесь нет
и быть не может: bead просит честное имя, а не новую проверку.

Ссылки на старое имя искались по всему дереву. В `docs/`, `AGENTS.md`,
`CLAUDE.md` и `.codex/handoff.md` их нет; два попадания — в журналах прогонов
`.codex/stages/content-factory-next-vme/evidence/`, и это записи о том, что
происходило в тот день, а не ссылки на файл.

# Delivery / Cleanup

Один коммит на своей ветке, `git mv` сохранил историю файла.

# Risks / Follow-ups / Explicit Defers

- Дефект, ради которого bead заведён, закрыт наполовину по замыслу самого bead:
  тест стал честным, но карточка по-прежнему ничем не измеряется. Снимок на
  320/390/1440 остаётся открытым вариантом, и заголовок файла теперь называет
  его прямо, чтобы следующий читатель не считал вопрос решённым.
