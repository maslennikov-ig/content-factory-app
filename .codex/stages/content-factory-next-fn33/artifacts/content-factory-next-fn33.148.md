---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: b4-cleanup
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: календарь /launches
public_facade: NoChannelNotice
bounded_acceptance: клик по пустой ячейке в пространстве без каналов даёт всем ролям одну понятную карточку, администратору — с кнопкой в каталог
non_goals:
  - черновик без канала (требует изменения схемы и двери; отдан владельцу отдельной задачей)
  - замена всплывашки «Пост пишет редактор» в пространстве, где каналы есть
evidence:
  - compose-needs-channel
task_id: content-factory-next-fn33.148
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: пустая ячейка календаря отвечает честно
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: решение упирается в модель данных, ответ надо было выбрать по коду, а не по экрану
repo: content-factory-next
branch: worktree-agent-a5ca72846a096ca1f
base_branch: wave/search-into-drafts-2026-09-05
base_commit: 1b019abd
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a5ca72846a096ca1f
write_zone:
  - apps/frontend/src/components/launches/no-channel.notice.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - libraries/react-shared-libraries/src/translation/locales/
  - tests/compose-needs-channel.test.cjs
  - tests/content-leads.role-visibility.test.cjs
success_criteria:
  - все роли получают одну карточку, а не всплывашку у одних и каталог у других
  - администратору кнопка в каталог, остальным — кто подключает
  - невозможность черновика без канала закреплена тестом по схеме и DTO
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - NoChannelNotice
parallel_group: B4
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: временные копии файлов в scratchpad удалены
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
docs_review_notes: новых дверей не заведено; каталог каналов остаётся за администраторской дверью, как записано в матрице ролей
verification:
  - "pnpm exec jest tests/compose-needs-channel.test.cjs": passed (9 тестов)
  - "pnpm exec jest tests/compose tests/calendar tests/content-leads.role-visibility.test.cjs": passed
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/launches/no-channel.notice.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/compose-needs-channel.test.cjs
  - tests/content-leads.role-visibility.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - content-factory-next-fn33.159 — вопрос владельцу «нужен ли черновик без канала» с разбором того, что для этого потребуется
---

# Summary

Сначала проверена модель данных, как и требовала задача. Черновик без канала сегодня невозможен: `Post.integrationId` в `schema.prisma` — обязательная колонка с обязательной связью с `Integration`, а `Post.integration` в `create.post.dto.ts` несёт `@IsDefined()`. Открыть окно поста означало бы дать человеку написать текст и потерять его на сохранении — ровно та форма дефекта, которую уже описал `content-factory-next-fn33.63` на соседнем экране. Поэтому чинится честность, а вопрос о самом черновике без канала заведён владельцу отдельной задачей `content-factory-next-fn33.159` (P3) с разбором шести мест, которые придётся тронуть.

Клик по пустой ячейке в пространстве без каналов теперь у всех ролей открывает одно окно: в шапке «Чтобы писать посты, подключите канал», в теле карточка `NoChannelNotice` со строкой «Пост всегда пишется для канала, а в этом пространстве нет ни одного». Администратору внутри карточки стоит кнопка «Добавить канал», ведущая в тот же каталог, что и раньше; редактору и участнику вместо кнопки — строка о том, кто подключает канал; участнику дополнительно сказано, что посты пишет редактор. Всплывашка как единственный носитель смысла с этого пути ушла.

# Scope / Routing

Порядок ветвления в ячейке изменён: пустое пространство теперь разбирается раньше роли, потому что без канала роль не меняет ответа. Всплывашка `create_post_editor_only` осталась на своём месте — в пространстве, где каналы есть, а человек не редактор; это ответ `content-factory-next-fn33.90`, и трогать его эта задача не просила.

Отклонение от «Сделать:» одно и мелкое: карточка не одинакова дословно у всех ролей, она одинакова по форме и по первым двум фразам, а последняя строка зависит от того, что этот человек может сделать сам. Сказать участнику «попросите администратора добавить канал» и умолчать, что писать посты он всё равно не сможет, было бы дорогой в второй отказ.

# Verification

- `pnpm exec jest tests/compose-needs-channel.test.cjs` — новый набор, 8/8. До правки красный: с прежним `calendar.tsx` два стража ячейки падали (2 failed, 6 passed), проверено откатом файла.
- `pnpm exec jest tests/compose tests/calendar tests/editorial-stage tests/roles-matrix.guard tests/content-leads.role-visibility` и пять стражей дизайна и локалей — 253/253.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 ошибок.

`tests/content-leads.role-visibility.test.cjs` держал прежнюю развилку построчно («администратору каталог, остальным всплывашка»). Правило, ради которого он написан, не изменилось — каталог остаётся за администраторской дверью, — поэтому страж переписан под новую форму ответа, а не ослаблен: он по-прежнему требует `isOrganizationAdmin` и требует, чтобы кнопка в каталог стояла под этой проверкой.

# Delivery / Cleanup

Коммит на ветке потока, не влит, не отправлен. Схема `schema.prisma` НЕ менялась.

# Risks / Follow-ups / Explicit Defers

Пока владелец не ответил на `content-factory-next-fn33.159`, календарь продолжает рисовать этапы «План / Пишется / Проверка» в пространстве, где написать нечего. Карточка это объясняет, но противоречие между обещанием полосы этапов и невозможностью черновика снимается только ответом владельца.

Заголовок заведённой задачи оставлен по-английски вынужденно: оболочка потока отказалась передавать кириллицу аргументом `bd`; русский заголовок вопроса записан в теле задачи.
