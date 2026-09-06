---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: S3
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: IntakeService (S1, options.slopCheck), AgentGraphService (S2, антикопия), экран intake (S4)
public_facade: SlopReportV1, AntiCopyReportV1, POST /content-intelligence/text-quality/slop-check
bounded_acceptance: проверка на штампы без модели показывает находки с местом в исходной строке; антикопия ловит восемь слов подряд и не ловит семь
non_goals:
  - автоправка текста
  - регистрация контроллера в api.module.ts (владелец файла — S1)
  - экраны и локали находок (S4)
  - вызовы модели любого рода
evidence:
  - text-quality-slop-check
  - text-quality-anti-copy
  - content-text-quality-routes
task_id: content-factory-next-tu3k.3
epic_id: content-factory-next-tu3k
stage_id: content-factory-next-fn33
session_id: волна «вход одной мыслью» 06.09.2026
milestone: черновик из мысли, ссылки или чужого поста
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: тридцать правил на регулярных выражениях с известными границами ложных срабатываний
repo: content-factory-next
branch: worktree-agent-a40399b5d4acccb34
base_branch: wave/intake-2026-09-06
base_commit: 2826fa71
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a40399b5d4acccb34
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/**
  - libraries/nestjs-libraries/src/dtos/content-intelligence/text-quality.dto.ts
  - apps/backend/src/api/routes/content-text-quality.controller.ts
  - docs/product/roles-matrix.md
  - docs/product/text-quality-check.md
  - tests/**
success_criteria:
  - anti-copy.ts выпущен первым, семь слов чисто, восемь — находка, соседние сливаются
  - смещения находок указывают в исходную строку, в том числе для HTML
  - не меньше 25 русских правил, у каждого пример срабатывания и молчания
  - skip-зоны: слово в «кавычках», в ссылке и в бэктиках находкой не становится
  - кап 15 с флагом truncated, счёт по всем находкам, вердикт 3/10/11
  - дверь под EDITOR, без модели, без базы
selected_docs:
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-a40399b5d4acccb34 не влита, ветка и worktree живы
risk_level: low
risk_tags:
  - public-api
affected_surfaces:
  - backend
  - api
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: roles-matrix.md (строка двери и абзац про отсутствие раздела AI), text-quality-check.md (новый документ)
verification:
  - "pnpm exec jest tests/text-quality.slop-check.test.cjs": passed
  - "pnpm exec jest tests/text-quality.anti-copy.test.cjs": passed
  - "pnpm exec jest tests/content-text-quality.routes.test.cjs": passed
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs tests/role-doors.three-roles.test.cjs": passed
  - "pnpm exec jest tests/ai-role-routing.guard.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs": passed
  - "pnpm exec jest tests/ai-doors-throttle.test.cjs tests/ai-usage.consumer-guard.test.cjs": passed
  - "pnpm exec jest tests/brand-voice.wiring-contract.test.cjs tests/cloud-saas-contract.test.cjs tests/content-brief.routes.test.cjs tests/backend-locale-strings.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/anti-copy.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-check.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.ru.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.en.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.types.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-skip-zones.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-platforms.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/text-quality.dto.ts
  - apps/backend/src/api/routes/content-text-quality.controller.ts
  - docs/product/roles-matrix.md
  - docs/product/text-quality-check.md
  - tests/text-quality.slop-check.test.cjs
  - tests/text-quality.anti-copy.test.cjs
  - tests/content-text-quality.routes.test.cjs
explicit_defers:
  - строка регистрации контроллера в api.module.ts — добавляет S1 при слиянии
---

# Summary

Проверка на ИИ-штампы без модели и антикопия восьми слов. Три коммита на своей
ветке, не отправлены.

`anti-copy.ts` выпущен первым коммитом: его импортирует поток канала и графа.
Семь общих слов — чисто, восемь — один отрезок, соседние совпадения сливаются;
регистр, «ё» и знаки препинания совпадению не мешают.

`slopCheck()` — 30 правил для русского (23 по выражениям + 7 счётчиков) и 15
для английского. Кап 15 находок с флагом `truncated`, счёт по всем находкам,
вердикт 3/10/11, пороги Telegram против умолчаний.

Дверь `POST /content-intelligence/text-quality/slop-check` под `EDITOR`, без
модели, без базы, потолок 20 000 знаков.

# Что нужно от оркестратора при слиянии

Одна строка в `apps/backend/src/api/api.module.ts` (владелец файла — S1):

```ts
import { ContentTextQualityController } from '@contentfactory/backend/api/routes/content-text-quality.controller';
```

и `ContentTextQualityController,` в массив `authenticatedController` (после
`ContentLeadController`).

Страж матрицы ролей читает папку `api/routes` через парсер TypeScript, а не
реестр модуля, поэтому дверь ему видна уже сейчас: `roles-matrix.guard` и
`role-doors.three-roles` зелёные до слияния. Опасение из задания не сбылось.

# Ловушка, которую легко повторить

Все три источника правил написаны на Python, где `\b` знает юникод. В
JavaScript `\b` живёт по ASCII: `\bчестн` не совпадёт ни разу — перед «ч» стоит
пробел, а сама «ч» для движка не буква. Перенесённые дословно правила молчали
бы всегда, а набор был бы зелёным. Границы слова заданы просмотром по
`\p{L}\p{N}` в `slop-rules.types.ts`.

# Решения, влияющие на слияние

- Седьмой файл `slop-rules.types.ts` сверх названных шести: форма правила и
  границы слова. Без него импорты правил и исполнителя замкнулись бы в кольцо.
- Два порога отклонены от наброска плана, оба против шума на коротком посте:
  жирного не меньше двух (у автора норма применяется от 200 слов), тире
  считается частотой только от трёх знаков.
- `platform` в отчёте — разрешённая площадка (`telegram`/`default`), а не эхо
  запроса: экран должен видеть, по каким порогам его посчитали.
- Смещения находок указывают в переданную строку, в том числе для HTML:
  разметка гасится пробелами, а не срезается.
- Счёт считается по всем находкам, а не по показанным пятнадцати.

# Verification

Восемь команд, все зелёные, перечислены в `verification`. 245 проверок в семи
наборах. Платных вызовов нет ни одного: в потоке нет ни одной модели.

# Risks / Follow-ups

- Правило `bureaucratic` ловит «данные» в значении «data» — слово частое и
  законное. Оставлено по прямому перечислению в задании; кандидат на снятие
  после первого живого прогона.
- Правило `negative-parallelism` — ошибка, а не предупреждение, и ловит «не
  только» в любом виде. Так у владельца в апстриме; на живом тексте может
  оказаться слишком строгим.
- Набор английских правил малый (15 против 30): признаки без спора. Расширять
  после того, как английский текст пойдёт через продукт.
