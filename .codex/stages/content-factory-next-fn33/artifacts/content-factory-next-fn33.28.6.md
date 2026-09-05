---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост», экран настроек AI, дверь context-review
public_facade: n/a
bounded_acceptance: целевые наборы jest по изменённой поверхности + tsc --noEmit
non_goals:
  - лента голоса (решение владельца fn33.28.4)
  - сцена обзора interface-review (fn33.28.5)
  - механика границы «только черновик» — правило не менялось, менялся его расчёт
evidence:
  - jest-post-context-review
  - jest-ai-allowance-parity
task_id: content-factory-next-fn33.28.6
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: очистка по рецензии волны compose
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: четыре несвязанные находки рецензии в бэкенде и фронтенде за один проход
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/new-launch/**
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/product/roles-matrix.md
  - tests/**
success_criteria:
  - мёртвый код после удаления панели контекста убран, типы чисты
  - осиротевший ключ trusted_context удалён из всех 16 локалей
  - /copilot/research записан в матрице ролей как дверь без потребителя
  - остаток квоты у участника и у администратора считается одним предикатом
  - дверь context-review идемпотентна по данным, а не по чтению до записи
  - отказ «сначала черновик» не приходит тому, кто удалил все коробки
selected_docs:
  - docs/design/component-authoring-rules.md
  - /tmp/.../scratchpad/review-compose.md (отчёт рецензии волны)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - stream-A
  - stream-B
  - stream-C
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - concurrency
  - idempotency
  - state-transition
  - tenancy
affected_surfaces:
  - backend
  - data
  - ui
invariants:
  - idempotency
  - state-transition
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — новый раздел про /copilot/research без потребителя в интерфейсе
verification:
  - "pnpm exec jest jest-post-context-review": passed
  - "pnpm exec jest jest-ai-allowance-parity": passed
  - "pnpm exec jest jest-locale-key-set jest-locale-translated jest-roles-matrix-guard tests/ai-allowance.*.test.cjs": passed
  - "pnpm exec jest jest-design-guard jest-design-contrast jest-foundation jest-compose-window-only-useful jest-posts-save-refusal": passed
changed_files:
  - apps/frontend/src/components/new-launch/editor.tsx
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/product/roles-matrix.md
  - jest-post-context-review
  - jest-ai-allowance-parity
explicit_defers:
  - ключ content_context_draft_only не удалён: ему дан потребитель в fn33.28.8
---

# Summary

Четыре находки рецензии волны 04.09, все P2, закрыты одним проходом.

1. **Мёртвый код.** Из `editor.tsx` убран неиспользуемый импорт `Button` и
   шесть чтений хранилища, оставшихся от удалённой панели контекста
   (`setContentIntelligenceProvenance`, `contentIntelligenceLoadState`,
   `setContentIntelligenceLoadState`, `contentIntelligenceFailure`,
   `setContentIntelligenceFailure`, `clearAllValueCitationIds`). Редактор был
   подписан на срезы, которых больше не рисует, и перерисовывался на их
   изменения. Ключ `trusted_context` удалён из всех шестнадцати локалей: его
   переименовали по значению в этой же волне, а читателя у него нет ни одного.
   Второй осиротевший ключ, `content_context_draft_only`, НЕ удалён — вместо
   этого ему дан потребитель в `fn33.28.8`. Дверь `POST /copilot/research`
   оставлена как есть и записана в матрицу ролей отдельным разделом.

2. **Один предикат остатка квоты.** `includedUsageFilter` экспортирован из
   `ai.usage.service.ts`, и экран настроек администратора считает им же вместо
   собранного руками `where`. До этого админский счёт брал все строки периода,
   включая брошенные сутки назад `admitted`, которые сам допуск уже не считает,
   и два экрана одного пространства показывали разное «осталось».

3. **Идемпотентность двери проверки.** Пара «`findFirst`, затем `updateMany`»
   заменена на `updateMany` с условием `contentContextReviewedAt: null` прямо в
   `where`. Ноль затронутых строк означает, что кто-то успел раньше: тогда
   строка перечитывается и ответом идёт дата и имя победителя, а не свои.
   Раннее чтение оставлено — оно отвечает без записи в обычном случае
   повторного нажатия.

4. **Отказ «сначала черновик» после удаления всех коробок.** Наружная проверка
   пропускает планирование, когда у тела есть связка (`group`), и решение
   отдаётся расчёту внутри транзакции, который видит строки. Там подтверждение
   ищется сперва по присланным id, а если их нет — по связке, с той же сверкой
   снимка. Новый пост связку тоже несёт, поэтому он по-прежнему честно получает
   «сначала черновиком»: у его связки строк нет.

# Scope / Routing

Зона записи соблюдена. Вне её тронуты только локали, матрица ролей и тесты —
это разрешено общими правилами потока. Схема Prisma не менялась.

Отклонение от «Сделать:»: bead предлагал `trusted_context` «либо использовать,
либо удалить»; выбрано удаление. Использовать его было негде — строку
происхождения печатает `ProvenanceLine` со своими ключами, и добавлять туда
семнадцатый синоним «Подтверждений» значило бы завести второй словарь для
одного понятия.

# Verification

Красное до правки, зелёное после — обе новые проверки:

- `tests/post.context-review.test.cjs` — без правки репозитория 3 падения из
  24 (гонка двух подтверждений, ответ опоздавшего, пост с удалёнными
  коробками); с правкой 24/24.
- `tests/ai-allowance.parity.test.cjs` — без правки 3 падения из 4; с правкой
  4/4.

Прогнаны и зелёные: `locale-key-set`, `locale-translated`,
`roles-matrix.guard`, `ai-allowance.{read,door,hint}`, `design.guard`,
`design.contrast`, `foundation`, `compose-window-only-useful`,
`posts.save-refusal`.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не сливалась и не выкладывалась.

# Risks / Follow-ups / Explicit Defers

- Правило «подтверждение переживает удаление всех коробок» держится на связке
  (`group`). Если окно когда-нибудь перестанет присылать связку у
  существующего поста, отказ вернётся — это закреплено тестом «a brand new post
  with a group of its own is still refused».
- Проверка по связке — дополнительный `findFirst` внутри транзакции, и он
  выполняется только тогда, когда по id подтверждения не нашлось.
- `POST /copilot/research` остаётся без входа в интерфейсе. Если исследование
  туда не вернётся, дверь стоит закрыть отдельным решением владельца, а не
  тихо; запись об этом теперь есть в матрице ролей.
