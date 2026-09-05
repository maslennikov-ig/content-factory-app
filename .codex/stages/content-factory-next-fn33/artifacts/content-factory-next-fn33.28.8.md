---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост», строка отказа сохранения
public_facade: n/a
bounded_acceptance: jest-posts-refusal-language + jest-posts-save-refusal
non_goals:
  - механика границы «только черновик» — правило не менялось
  - английские строки сервера в журнале остаются английскими
evidence:
  - jest-posts-refusal-language
task_id: content-factory-next-fn33.28.8
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: человеческие подписи окна поста
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: перевод восьми кодов отказа на шестнадцать локалей с проверкой полноты
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/new-launch/post-save-error.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - 409 CONTENT_CONTEXT_DRAFT_ONLY печатается по-русски на русском экране
  - соседние коды раздела переведены тем же способом
  - в тексте отказа нет кода ошибки
  - неизвестный код по-прежнему доносит английский message сервера
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
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: поведение границы не менялось, изменился только язык отказа
verification:
  - "pnpm exec jest jest-posts-refusal-language": passed
  - "pnpm exec jest jest-posts-save-refusal": passed
  - "pnpm exec jest jest-locale-key-set jest-locale-translated": passed
changed_files:
  - apps/frontend/src/components/new-launch/post-save-error.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - jest-posts-save-refusal
  - jest-posts-refusal-language
explicit_defers:
  - none
---

# Summary

Отказ сервера при сохранении поста печатается на языке окна.

`message` от сервера английский всегда: это строка из `posts.repository.ts` и
`content-context.finalize.ts`, написанная для журнала. Язык знает только
клиент, поэтому текст выбирает он — по `code`. В `post-save-error.ts` появилась
таблица `POST_SAVE_REFUSAL_COPY`: восемь кодов раздела, у каждого ключ
перевода. Обёртка «Пост не сохранён: {{message}}» осталась прежней, меняется
только то, что в неё подставляется.

Переведены все восемь кодов, которыми сервер отказывает на этом пути:
`CONTENT_CONTEXT_DRAFT_ONLY`, `CONTENT_CONTEXT_NOT_FOUND`,
`CONTENT_CONTEXT_INVALIDATED`, `CONTENT_CONTEXT_PROFILE_MISMATCH`,
`CONTENT_CONTEXT_CITATIONS_INVALID`, `CONTENT_CONTEXT_INPUT_INVALID`,
`POST_NOT_FOUND`, `AUTOPOST_V2_CONFLICT`. `CONTENT_EVIDENCE_REQUIRED` берёт уже
существующий ключ `compose_blocked_evidence_required` — это тот же отказ, что
печатает клиентский двойник границы, и одна граница не должна звучать двумя
фразами.

Осиротевший ключ `content_context_draft_only`, который рецензия предлагала
удалить (`fn33.28.6`), получил здесь своего потребителя и переписан
человеческими словами вместо «Результат контентного интеллекта можно сохранить
только как черновик».

Неизвестный код — не поломка: остаётся английский `message` сервера, что лучше
молчания. Пустое тело и «Internal server error» по-прежнему дают общую фразу.

# Scope / Routing

Зона записи соблюдена; вне её только локали и тесты.

Отклонение от общих правил, названное вслух: правила потока говорят «ru и en —
человеческий текст, остальные — английский текст», но коммит-образец
`7d34bc2a`, на который они же ссылаются, переводит ключ во все шестнадцать
локалей по-настоящему (ja получил японский). Кроме того,
`tests/locale-translated.test.cjs` требует, чтобы локаль своего письма
использовала своё письмо в каждом значении, — восемь английских значений
потребовали бы 56 записей в allowlist. Сделан честный перевод всех
шестнадцати; allowlist не тронут, проверка письма зелёная.

Оговорка того же рода, что стоит в шапке `backend-strings.ts`: значения `ka_ge`
и `bn` проверены только машинно, носитель их не читал.

# Verification

Красное до правки: `tests/posts.refusal-language.test.cjs` и
`tests/posts.save-refusal.test.cjs` вместе — 6 падений из 13. После правки
13/13 зелёных.

Новый набор `posts.refusal-language.test.cjs` держит три вещи и НЕ переписывает
список кодов руками — он вынимает их из самих источников сервера, поэтому новый
отказ без перевода уронит проверку сам:

- каждый код, которым отказывает сервер, есть в таблице окна (8 из 8);
- каждый ключ таблицы есть во всех шестнадцати локалях;
- ни в одном переводе нет кода ошибки.

`locale-key-set` и `locale-translated` зелёные.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не сливалась и не выкладывалась.

# Risks / Follow-ups / Explicit Defers

- У `CONTENT_CONTEXT_DRAFT_ONLY` на сервере две разные английские фразы
  (планирование и правка опубликованного) на один код. Перевод один и написан
  так, чтобы быть верным в обоих случаях. Если различие когда-нибудь станет
  важным человеку, разделять надо кодом на сервере, а не текстом на клиенте.
- Тексты `ka_ge` и `bn` не читал носитель языка.
