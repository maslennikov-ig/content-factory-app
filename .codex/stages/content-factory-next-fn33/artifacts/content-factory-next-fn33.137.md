---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-E
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration stream for wave/owner-decisions-2026-09-05
public_facade: PostsService.generatePostsDraft
bounded_acceptance: черновик один; хвост со ссылкой появляется только при непустой ссылке и на языке канала
non_goals:
  - трогать остальные пути создания поста
  - менять контракт CreateGeneratedPostsDto
  - чинить уже созданные лишние черновики на стенде
evidence:
  - posts-generated-draft-tail
  - backend-locale-strings
  - posts-service-consumers
  - backend-typecheck
task_id: content-factory-next-fn33.137
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: Генератор честен про материал, отказ виден человеку, черновик один
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: короткая правка, но в файле вне выданной зоны записи — решение о границе важнее самого кода
repo: content-factory-next
branch: worktree-agent-a49e5994ac8494368
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813ccd3e6213c07c0791e9fb535c66bfd8af1
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a49e5994ac8494368
write_zone:
  - tests/**
  - libraries/nestjs-libraries/src/locale/backend-strings.ts (каталог локалей)
  - ВНЕ ЗОНЫ - libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts (единственное место, где рождается хвост)
success_criteria:
  - без ссылки — одна коробка в черновике
  - со ссылкой — две, и подпись на языке канала
  - пробелы вместо адреса считаются отсутствием ссылки
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка оставлена корневому потоку слияния; правка вне зоны вынесена в отдельный коммит
risk_level: medium
risk_tags:
  - data
  - user-flow
affected_surfaces:
  - backend
  - data
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: поведение донорского хвоста нигде не описано документом продукта
verification:
  - pnpm exec jest tests/posts: passed
  - pnpm exec jest tests/telegram.post.statistics tests/backend-locale-strings tests/brand-voice.edits tests/post.context-review: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/posts.generated-draft-tail.test.cjs
  - tests/telegram.post.statistics.test.cjs
explicit_defers:
  - лишние черновики, уже созданные на стенде 05.09.2026, остаются в базе — их чистит владелец или отдельная задача
---

# Summary

`POST /posts/generator/draft` дописывал в ветку поста ещё одну коробку —
«Check out the full story here:» и адрес источника, — и дописывал всегда. У
запроса без `url` и `postId` вместо адреса оставалась пустая строка, поэтому
рядом с каждым русским черновиком в базе стенда лежал второй, английский и
пустой: десять записей Post вместо пяти.

Теперь ссылка считается ссылкой только если после обрезки пробелов от неё
что-то осталось; иначе хвоста нет вовсе. Когда ссылка есть, подпись берётся из
каталога строк бэкенда по языку канала (`Integration.contentLanguage`) —
читают её подписчики канала, а не тот, кто нажал кнопку. Английский текст
подписи сохранён дословно, чтобы у англоязычного канала ничего не изменилось.

# Scope / Routing

**Правка вне выданной зоны записи.** Зона потока называла генератор и окно
поста, а хвост рождается в `PostsService.generatePostsDraft`
(`libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`) —
других мест в дереве нет, во фронтенде вызывающих у этой двери тоже нет. Правка
занимает один метод и вынесена в отдельный коммит, чтобы корневой поток мог
принять или отложить её отдельно. Ни одна из соседних веток волны этот файл не
трогает (проверено `git diff --name-only` по семи веткам worktree).

Ключ `generated_draft_source_link` добавлен в каталог локалей бэкенда во всех
шестнадцати языках — это разрешённое исключение зоны («локали»).

`tests/telegram.post.statistics.test.cjs` носит собственный загрузчик модулей,
который не разбирает `@contentfactory/*`; новый импорт каталога пришлось назвать
ему путём, иначе набор падал на разрешении импорта.

# Verification

Новый набор `tests/posts.generated-draft-tail.test.cjs` был красным до правки (3
падения из 4). После: `tests/posts` (3 набора, 19 тестов), потребители
`posts.service` (`telegram.post.statistics`, `brand-voice.edits`,
`post.context-review`) и `backend-locale-strings` зелёные, `tsc --noEmit -p
apps/backend/tsconfig.json` чистый.

# Risks / Follow-ups / Explicit Defers

Хвост со ссылкой сохранён, а не удалён: у запроса с `url` он несёт смысл, и
удалять чужое поведение без нужды в этой задаче незачем. Уже созданные на стенде
лишние черновики код не трогает.
