---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/media.upload-limit.test.cjs, tests/media-empty-state-limits.test.cjs, tests/media-box.opening.test.cjs, tsc frontend
non_goals:
  - перевод фраз о загрузке в 16 локалях (они уже переведены)
  - изменение самих пределов загрузки
evidence:
  - none
task_id: content-factory-next-fn33.95
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: помощник с новым параметром и два вызова, плюс правка стража
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - libraries/nestjs-libraries/src/upload/upload.limits.ts
  - apps/frontend/src/components/media/new.uploader.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - tests/media.upload-limit.test.cjs
  - tests/media-empty-state-limits.test.cjs
  - tests/media-box.opening.test.cjs
success_criteria:
  - в русском интерфейсе пишется «10 МБ» и «1 ГБ»
  - оба вызова передают язык
  - язык без своего написания оставляет международное MB/GB
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
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: текст интерфейса
verification:
  - pnpm exec jest tests/media: passed (4 набора, 31 проверка)
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/upload/upload.limits.ts
  - apps/frontend/src/components/media/new.uploader.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - tests/media.upload-limit.test.cjs
  - tests/media-empty-state-limits.test.cjs
  - tests/media-box.opening.test.cjs
explicit_defers:
  - none
---

# Summary

`formatUploadSizeLimit` принимает язык и пишет единицу так, как её пишут на этом языке: русский — «10 МБ» и «1 ГБ». Оба места, где предел печатается человеку, язык передают: подпись пустой библиотеки (`media.component.tsx`) и два отказа при загрузке слишком большого файла (`new.uploader.tsx`).

Написание единиц взято не из воздуха: сервер уже пишет «Изображение больше 10 МБ», «L'image dépasse 10 Mo» и арабский вариант в `backend-strings.ts`. Те же три языка (ru, fr, ar) перечислены в таблице помощника, остальные оставляют международное MB/GB.

# Scope / Routing

Отклонение от «Сделать:»: единицы взяты не через словари локалей, а таблицей рядом с числами. Причина — MB/GB не английский текст, а международное обозначение: заведи я ключи переводов, восемь нелатинских локалей пришлось бы вносить в `locale-untranslated-allowlist.json` за то, что они пишут «MB» так же, как английский. Решение о написании принято один раз и там же, где числа, и совпадает с каталогом серверных строк.

# Verification

Проверки: ru → «10 МБ»/«1 ГБ», ru-RU → «1 ГБ», fr → «10 Mo», de и язык без указания → «10 MB»; отдельная проверка, что оба экрана передают язык. `tests/media-box.opening.test.cjs` получил заглушку `useVariables` — библиотека теперь читает язык.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Если владелец захочет иное написание для какого-то языка (например, «МБ» для белорусского), это одна строка в таблице `SIZE_UNITS`.
