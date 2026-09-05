---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: customFetch/useFetch — единственная дверь фронтенда к бэкенду (libraries/helpers/src/utils/custom.fetch.func.ts)
bounded_acceptance: tests/custom-fetch-clone.test.cjs, tests/logged-auth.route-scope.test.cjs, tsc frontend
non_goals:
  - живой прогон отказов 402/403 поверх общей модалки
evidence:
  - none
task_id: content-factory-next-fn33.105
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: одна строка в общем помощнике, через который идут все запросы фронтенда
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/custom-fetch-clone.test.cjs
success_criteria:
  - у удачного ответа clone() не вызывается ни разу
  - отказ по-прежнему получает копию, тело читаемо с обеих сторон
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-r
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - api
affected_surfaces:
  - ui
  - api
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: помощник внутренний, документами не описан
verification:
  - pnpm exec jest tests/custom-fetch-clone.test.cjs tests/logged-auth.route-scope.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/custom-fetch-clone.test.cjs
explicit_defers:
  - вторая половина задачи (402/403 показывают свой отказ поверх общей модалки) требует живого прогона и оставлена владельцу
---

# Summary

Копия ответа снималась с каждого запроса, а читалась только у отказов 402 и 403. Непрочитанная копия удерживает поток целиком: генерация постов читается через `getReader()`, и браузер вынужден держать всё написанное в памяти, чтобы обе половины копии шли вровень. Теперь копия снимается только при `!response.ok`; удачный ответ уходит обработчику как есть — там читаются только заголовки.

# Scope / Routing

Один файл помощника и новый набор. Обработчик `afterRequest` в `layout.context.tsx` перечитан целиком: тело он читает только на 403 и 402, оба — не `ok`.

# Verification

Красный до правки: у удачного ответа `clone()` вызывался один раз, ожидалось ноль.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Вторая половина задачи — экран показывает свой отказ поверх общей модалки на 402/403 — требует живого прогона с владельцем и здесь не делалась.

---

# Продолжение 05.09.2026 (stream-C, волна «зачистка»)

Первая половина проверена на ветке `wave/cleanup-2026-09-05` и не
переделывалась: `pnpm exec jest tests/custom-fetch-clone.test.cjs` — зелёный.

Вторая половина разобрана по коду, без живого прогона, и остаётся **открытой**:
правка живёт в `apps/frontend/src/components/layout/layout.context.tsx`, вне
зоны записи потока.

**403 больше не дублируется.** Общий обработчик (`layout.context.tsx:144`)
молчит, если тело отказа несёт `code`: отказ, который называет себя,
принадлежит поверхности, которая спрашивала. Раздел «Контент» и окно поста как
раз такие — сервер отвечает `{code, message}`.

**402 показывается дважды, и обе половины плохи.** `SubscriptionException`
(`apps/backend/src/services/auth/permissions/permission.exception.class.ts`)
кладёт в тело `{ section, action }` — поля `message` там нет. Общий обработчик
на 402 зовёт `deleteDialog((await response.json()).message, 'Move to billing',
'Payment Required')`, то есть печатает модалку с описанием `undefined`.
Вызывающий экран получает тот же ответ с `ok === false` и показывает своё:
`postSaveErrorMessage` не находит ни `message`, ни известного `code` и печатает
общее «Пост не сохранён, попробуйте ещё раз». Человек, у которого кончился
предел постов в месяц, получает две плашки и ни в одной — причины.

Предлагается одним куском: на 402 читать `section`/`action` и называть предел
вместо `undefined`, вернуть `false` (договор «отказ уже показан») и научить
окно поста молчать на 402. Первая часть — самостоятельный дефект: `undefined` в
модалке виден без всякого дублирования и стоит отдельной задачи.
