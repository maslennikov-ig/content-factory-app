---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: S2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: сервер входа (S1, IntakeService), экран карточки канала (S4)
public_facade: ChannelWritingProfileResponseV1, GET/PUT/DELETE /integrations/:id/writing-profile
bounded_acceptance: канал доносит до промпта, как в него пишут; подсказки входа читаются графом аддитивно; восемь слов чужого текста стоят одной повторной генерации; карточка живёт в колонке и правится редактором
non_goals:
  - сервер входа и его двери (S1)
  - проверка на ИИ-штампы (S3)
  - экраны карточки и входа (S4)
  - карточки для площадок, кроме Telegram (исследование есть только по нему)
evidence:
  - channel-writing-profile
  - agent-channel-directives
  - agent-intake-hints
  - integrations-writing-profile-routes
task_id: content-factory-next-tu3k.2
epic_id: content-factory-next-tu3k
stage_id: content-factory-next-fn33
session_id: волна «вход одной мыслью» 06.09.2026
milestone: черновик из мысли, ссылки или чужого поста
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка идёт по контракту карточки, промпту генератора, схеме базы и трём дверям сразу
repo: content-factory-next
branch: worktree-agent-a6d2fff7968e1fed5
base_branch: wave/intake-2026-09-06
base_commit: 2826fa71
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6d2fff7968e1fed5
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/channels/**
  - libraries/nestjs-libraries/src/agent/**
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/integrations/**
  - libraries/nestjs-libraries/src/dtos/integrations/**
  - apps/backend/src/api/routes/integrations.controller.ts
  - docs/operations/integration-writing-profile-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/roles-matrix.md
  - tests/**
success_criteria:
  - карточка канала разбирается защитно, NULL читается как умолчания провайдера
  - строки канала встают после примеров автора и до guardrails в обеих ветках блока голоса
  - с подсказками площадка доходит до строителя контекста и до разрешения голоса
  - без подсказок ни одна строка промпта не меняется
  - восемь слов подряд из чужого текста дают одну повторную генерацию и квитанцию
  - PUT/DELETE карточки под EDITOR, чтение — любой участник, запросы в области
selected_docs:
  - /home/me/.claude/plans/lexical-sauteeing-bubble.md
  - docs/product/roles-matrix.md
  - docs/operations/production-deploy.md
  - /home/me/code/content-factory/docs/research/channel-playbooks/telegram/raw/compass-artifact-2026-05-telegram-playbook.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k
depends_on_streams:
  - S1 (контракт 2826fa71 — влит в ветку потока)
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-a6d2fff7968e1fed5 не влита, три коммита, не отправлена
risk_level: high
risk_tags:
  - data
  - public-api
  - prompt
affected_surfaces:
  - backend
  - api
  - data
invariants:
  - tenancy
  - prompt-injection
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: roles-matrix.md (строка и абзац про единственную неадминскую дверь /integrations), production-deploy.md (подраздел схемы волны и строка в списке файлов применения)
verification:
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec jest tests/channel-writing-profile.test.cjs": passed (18)
  - "pnpm exec jest tests/agent.channel-directives.test.cjs": passed (19)
  - "pnpm exec jest tests/agent.intake-hints.test.cjs": passed (15)
  - "pnpm exec jest tests/integrations.writing-profile.routes.test.cjs": passed (9)
  - "pnpm exec jest tests/agent tests/generator tests/autopost tests/web.research tests/channel-writing-profile tests/integrations.writing-profile tests/roles-matrix tests/role-doors tests/prisma tests/integration tests/backend-no-dynamic": passed (34 наборов, 450 проверок)
  - "node scripts/operations/validate-prisma-migration-sql.cjs --mode update --allow-table Integration --diff <migrate-diff> --selected docs/operations/integration-writing-profile-schema-apply.sql": passed
  - "pnpm dlx prisma@6.5.0 migrate diff --from-url <стенд localhost:5433> --to-schema-datamodel schema.prisma --script": passed (один ALTER TABLE плюс 27 mastra_* DROP TABLE)
  - "pnpm run prisma-generate": passed
  - "красное до правки: pnpm exec jest tests/agent.intake-hints tests/agent.channel-directives на файлах 2826fa71": failed (14 из 34)
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts
  - libraries/nestjs-libraries/src/agent/channel-directives.ts
  - libraries/nestjs-libraries/src/agent/intake-hints.ts
  - libraries/nestjs-libraries/src/agent/anti-copy.local.ts
  - libraries/nestjs-libraries/src/agent/voice-directives.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts
  - libraries/nestjs-libraries/src/dtos/integrations/integration.writing.profile.dto.ts
  - apps/backend/src/api/routes/integrations.controller.ts
  - docs/operations/integration-writing-profile-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/roles-matrix.md
  - tests/channel-writing-profile.test.cjs
  - tests/agent.channel-directives.test.cjs
  - tests/agent.intake-hints.test.cjs
  - tests/integrations.writing-profile.routes.test.cjs
  - tests/role-doors.three-roles.test.cjs
  - tests/web.research.degradation.test.cjs
  - tests/generator.voice-single-source.test.cjs
explicit_defers:
  - libraries/nestjs-libraries/src/agent/intake-hints.ts — временный дом типов `IntakeGenerationHintsV1`/`GeneratorRunInput`; при слиянии переезжают в `agent/generator-run-input.ts` потока S1, форма согласована дословно
  - libraries/nestjs-libraries/src/agent/anti-copy.local.ts — временный дом `wordShingles`/`sharedRuns`; при слиянии импорт в графе переводится на `content-intelligence/text-quality/anti-copy.ts` потока S3, файл уходит
  - hints.borrowed (тема, угол, строение чужого поста) в промпт не заводится: это работа сервера входа, а не графа
  - карточка «Как пишем сюда» на экране и её адаптер — S4; ответ двери контрактный, тело PUT дискриминировано (см. ниже)
---

# Summary

Канал перестал быть для генератора только языком. Карточка «Как пишем сюда»
(`ChannelWritingProfileV1`) живёт в новой колонке `Integration.writingProfile`,
разбирается защитно и превращается в строки промпта: лимит площадки (с
картинкой — вчетверо меньший), рабочий диапазон длины, пуш-превью 80–180
знаков, абзац 2–4 строки, разметка, эмодзи, ссылки, хэштеги, один призыв,
строение формата, заметка человека и запрет восьми слов подряд из чужого
материала. Числа — из материалов владельца от 20.05.2026; ни одна строка
промпта оттуда не переписана.

Граф читает необязательные подсказки входа (`body.intake`). С ними площадка
доходит до строителя контекста и до разрешения голоса (`PlatformVoiceOverrideV1`
начинает действовать), строки канала встают после примеров автора и до
guardrails, бриф идёт значением шаблона в хук и в контент, унаследованные
строки про хэштеги и призыв уступают карточке, а совпадение с чужим текстом в
восемь слов стоит одной повторной генерации и попадает в квитанцию `antiCopy`.
Без подсказок промпт побайтово прежний — на это есть отдельная проверка.

Три двери: `GET /integrations/:id/writing-profile` без политик (как и чтение
канала), `PUT` и `DELETE` под `[Update, EDITOR]`. Это единственная неадминская
дверь под `/integrations/…`, и в матрице ролей записано, почему: здесь
настраивается не канал, а письмо в него.

# Scope / Routing

Зона записи соблюдена. Сверх названного в задании потребовались три файла:

- `tests/web.research.degradation.test.cjs` и
  `tests/generator.voice-single-source.test.cjs` — местные загрузчики собирают
  `AgentGraphService` вручную и не знали про два новых импорта. Добавлены
  настоящие модули (не заглушки), поведение наборов не менялось;
- `scripts/evidence/voice-eval/product-graph.cjs` не тронут: он резолвит
  workspace-импорты сам.

Ветка потока была основана на `0c912aa5`, то есть без общего контракта.
Выполнено `git merge --ff-only wave/intake-2026-09-06` до `2826fa71`; своих
коммитов на ветке к тому моменту не было, чужая работа не затронута.

# Findings

**LangGraph молча теряет необъявленный ключ состояния.** Проверено на
`@langchain/langgraph` 1.2.8 отдельным прогоном: узел вернул поле, которого нет
среди `channels`, и `invoke` отдал состояние без него. Значит `draftGaps`,
который `generateContent` возвращает с 05.09.2026, до потока `values` не
доходил вовсе, и экран генератора
(`apps/frontend/.../generator.tsx:361`) читал `load.draftGaps` всегда пустым.
Канал объявлен вместе с четырьмя новыми — это одна строка и то же самое
исправление. Отдельного набора на предложение после черновика я не заводил:
оно принадлежит `fn33`, а не этой волне.

# Decisions

1. **Умолчания для площадки без исследования** (`GENERIC_WRITING_DEFAULTS`):
   `lengthPolicy: 'provider_max'`, эмодзи свободно, ссылки внутри текста,
   хэштеги запрещены, призыва нет. Исследование у продукта одно и оно про
   Telegram; для VK или рассылки честный ответ — «длину держит сама площадка».
   Хэштеги и призыв оставлены запрещёнными не из осторожности, а чтобы промпт
   такого канала звучал ровно как до волны.
2. **`ctaKind: 'none'` — это решение, а не молчание карточки**: «не приделывай
   призыв, кончай когда мысль кончилась». У канала без измеренного обычая
   приделанный призыв и есть тот штамп, из-за которого текст читают как
   машинный.
3. **Строка призыва повторяется дважды при подсказках** — в блоке голоса (как
   часть строк канала) и в списке инструкций, где она заменила унаследованное
   «Try to put some call to action». Так буквально сказано в задании; строки
   идентичны, поэтому противоречия нет, но при желании оркестратор снимет
   дубль одной строкой в `ctaInstruction`.
4. **Тело `PUT` дискриминировано, ответ контрактный.** В контракте
   `lengthPolicy` — союз «строка или объект». Приложение включает
   `whitelist: true` и `transform: true`, а `@Type(() => …)` на поле, которому
   законно прийти строкой, превратил бы её в пустой объект ещё до проверки:
   «длину держит площадка» молча стало бы «диапазон без границ». Поэтому на
   входе два поля — `lengthPolicy: 'provider_max' | 'range'` и вложенный
   `length`, — а перевод в контрактную форму делает сервис. **S4 это касается
   напрямую.**
5. **Антикопия сравнивает только контент, не хук.** Повторная генерация
   переписывает контент; совпадение в хуке она не починит, а квитанция о нём
   вводила бы в заблуждение.
6. **Потолок карточки сверяется с `maxLength`, а не с `maxCaptionLength`.**
   Карточка описывает канал целиком, а подпись под картинкой короче у всех
   площадок, где она вообще есть.

# Verification

Красное до правки показано на файлах базового коммита: восстановленные из
`2826fa71` `agent.graph.service.ts` и `voice-directives.ts` дали 14 падений из
34 в `agent.intake-hints` и `agent.channel-directives`. Наборы
`channel-writing-profile` и `integrations.writing-profile.routes` до правки
падали на отсутствии модулей.

Зелёные прогоны перечислены в `verification`. Платных вызовов моделей нет:
модель подменена целиком, `start()` прокручивается до первого события, которое
выдаётся раньше компиляции графа.

`prisma migrate diff` снят против базы стенда разработки (`localhost:5433`,
`cf-dev-db`) — она стоит на базовой схеме, поэтому вывод содержит ровно один
`ALTER TABLE "Integration" ADD COLUMN "writingProfile" JSONB;` и 27
`DROP TABLE "mastra_*"`. Валидатор с `--mode update --allow-table Integration`
принял выбранный файл. К боевой базе не обращался; `db push`/`migrate dev` не
запускались.

`scripts/orchestration/run_process_verification.sh` не запускал: он читает
общее состояние стадии, а `.codex/handoff.md` принадлежит корню и меняется
после слияния потоков.

# Delivery / Cleanup

Три коммита на ветке `worktree-agent-a6d2fff7968e1fed5`, не отправлены. Beads не
закрыт, задача взята через `bd update --claim`. `stage-manifest.json` не тронут.

# Risks / Follow-ups / Explicit Defers

- **Схема на боевой базе не применена.** Файл
  `docs/operations/integration-writing-profile-schema-apply.sql` помечен «ПОКА
  НЕ ПРИМЕНЕНО», подраздел в runbook требует копии базы, `psql
  --single-transaction`, сверки числа `mastra_*` таблиц и применения **до**
  переключения образа. Разрешение владельца на этот шаг — отдельное, его нет.
- Два временных файла (`intake-hints.ts`, `anti-copy.local.ts`) ждут слияния с
  S1 и S3; оба помечены комментарием в шапке и в месте импорта.
- `hints.borrowed` в промпте не используется — строение чужого поста доводит до
  брифа сервер входа.
- Заметка человека из карточки попадает в инструктивную часть промпта. Ограда та
  же, что у выученного правила аватара (переводы строк снимаются, ёлочки
  заменяются на прямые, длина режется по 500), и на неё есть три проверки.
- Карточка сегодня заполняется только для Telegram. Умолчания остальных площадок
  сознательно ничего не обещают; заводить их без исследования — та самая выдумка,
  которую этот эпик убирает.
