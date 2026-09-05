---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: b3-screens
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно поста, витрина «Откуда факты», панель поиска во вкладке «Бриф»
public_facade: n/a
bounded_acceptance: целевые jest-наборы окна поста, витрины и панели поиска плюс стражи дизайна и локалей; tsc фронтенда
non_goals:
  - бэкенд и строитель контекста (поле provenance приходит от потока B1)
  - смена спецификации docs/product/content-memory-spec.md
  - стенд interface-review (файл вне зоны записи)
evidence:
  - search_evidence_label_red_then_green
  - frontend_typecheck_clean
task_id: content-factory-next-ec48.2
epic_id: content-factory-next-ec48
stage_id: content-factory-next-fn33
session_id: волна «поиск в черновик» 05.09.2026
milestone: пометка «взято из поиска» на трёх экранах
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: интерфейсная работа со словами и склонениями в двух языках, цена ошибки — неправда на экране
repo: content-factory-next
branch: worktree-agent-a60a361131a4635ac
base_branch: wave/search-into-drafts-2026-09-05
base_commit: d25ed736b24a94fac2baec52ec22af8235cf6d98
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a60a361131a4635ac
write_zone:
  - apps/frontend/src/components/new-launch/**
  - apps/frontend/src/components/content-intelligence/**
  - tests/**
  - libraries/react-shared-libraries/src/translation/locales/**
success_criteria:
  - searchEvidenceCount считается по evidence[i].provenance === 'SEARCH', отсутствие поля читается как CONFIRMED
  - записка окна поста про вошедшее из поиска склоняется по-русски и читается по-английски
  - прежняя записка про неподтверждённое остаётся только для отказов UNVERIFIED
  - у элемента SEARCH в списке материала стоит моноширинный ярлык на cf-токенах
  - витрина подписывает найденное без принятой оценки «Взято из поиска, не подтверждено»
  - панель поиска обещает текст с пометкой, а не отказ
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: волна ec48
depends_on_streams:
  - B1 (поле provenance в конверте контекста)
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт в worktree, не сливалась и не пушилась
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
docs_review_notes: спецификацию content-memory-spec.md меняет поток B1 вместе с поведением строителя; здесь только слова на экране
verification:
  - "pnpm exec jest tests/new-launch.search-evidence-label.test.cjs (до правок)": failed
  - "pnpm exec jest <девять наборов, включая новый>": passed
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/design.typography.test.cjs": passed
  - "pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs tests/content-search-evidence.test.cjs tests/content-facts.search.test.cjs tests/interface-review": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/components/new-launch/compose.copy.ts
  - apps/frontend/src/components/new-launch/unverified-evidence.note.tsx
  - apps/frontend/src/components/new-launch/search-evidence.mark.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/new-launch.search-evidence-label.test.cjs
explicit_defers:
  - стенд apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx не получил состояния с ярлыком SEARCH — файл вне зоны записи
---

# Summary

Найденное поиском теперь называется на экране тем словом, каким его назвал
владелец 05.09.2026: «взято из поиска», а не «не проверено». Слово стоит в
трёх местах и везде одно и то же — в записке под постом, ярлыком у строки
списка материала и подписью на витрине «Откуда факты», — а панель поиска
перестала обещать отказ, которого больше не будет.

Разделены два разговора, которые раньше были одним. `unverifiedCount` считает
отказы конверта и остаётся про то, чего в тексте нет. Новый
`searchEvidenceCount` считает состав конверта и говорит про то, что в тексте
есть и под каким именем. Поэтому и записок стало две, а не одна с двумя
смыслами.

# Scope / Routing

Зона записи — окно поста и раздел «Контент» во фронтенде, тесты и локали.
Бэкенд не тронут: поле `evidence[i].provenance` приходит от потока B1, в
тестах конверт с этим полем подставляется вручную.

Ярлык собран не с нуля: это `Status` с тоном `info` — ровно тот, каким витрина
красит «Найдено поиском». Одно происхождение, увиденное из двух мест, должно
узнаваться с одного взгляда, а `label-sm` моноширинный, то есть ярлык читается
как штамп.

Разбор конверта незнакомое значение `provenance` не роняет, а читает как
`CONFIRMED`. Конверт — единственный носитель строки происхождения; уронить его
из-за слова, которого фронтенд ещё не знает, значило бы убрать с экрана и
происхождение, и список материала разом.

Ключ `citation_from_search` заведён во всех шестнадцати локалях (ru и en —
человеческий текст, остальные — английский) и записан в
`tests/locale-untranslated-allowlist.json` для восьми нелатинских с пересчётом
`untranslatedTotals`.

# Verification

Новый набор `tests/new-launch.search-evidence-label.test.cjs` до правок:
15 упавших из 18. После правок — 18 из 18.

Девять наборов задания вместе с новым: 111 тестов, все зелёные. Локали и
типографика: 13 зелёных. Соседние наборы, которые читают те же файлы
(потребитель контекста, доказательства поиска, поиск по фактам, стенды
interface-review): 110 зелёных. `tsc --noEmit` фронтенда — ноль ошибок.

# Delivery / Cleanup

Один коммит на своей ветке в worktree. Не пушилось, не сливалось, beads не
закрывались.

# Risks / Follow-ups / Explicit Defers

- Пока поток B1 не выставил `provenance`, конверт читается как полностью
  подтверждённый: `searchEvidenceCount` равен нулю, ярлыков нет, ничего не
  ломается. Экраны включатся сами, как только поле появится.
- Стенд `interface-review/content-intelligence/consumer` не показывает
  состояние с ярлыком: файл лежит в `apps/frontend/src/app/(stand)/…`, вне
  зоны записи. Отдельный маленький шаг для того, кто владеет стендом.
- Прежняя записка про неподтверждённое осталась в живых намеренно: отказы
  `UNVERIFIED` после B1 не исчезают совсем — найденное успевает устареть или
  пропасть до сборки, и тогда сказать об этом по-прежнему надо.
