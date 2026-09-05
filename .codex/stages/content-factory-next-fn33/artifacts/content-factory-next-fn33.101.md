---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-S
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: the tenant-isolation guard now reads findMany calls whose where names a row id; the ownership check in posts.repository is listed as ALLOWED with its reason
bounded_acceptance: tests/tenant-isolation.guard.test.cjs
non_goals:
  - изменение самого запроса в posts.repository.ts
  - count, который остаётся вне проверки
evidence:
  - tenant-isolation-findmany-red-green
task_id: content-factory-next-fn33.101
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: расширение области проверки требует прочитать каждый новый улов
repo: content-factory-next
branch: worktree-agent-ae080d20173abc0bb
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae080d20173abc0bb
write_zone:
  - tests/tenant-isolation.guard.test.cjs
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts (только комментарий)
success_criteria:
  - findMany с where по строке попадает в проверку
  - запрос проверки владения записан в ALLOWED с причиной
  - список ALLOWED не пополняется непрочитанным
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-S
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - tenancy
  - security
affected_surfaces:
  - backend
invariants:
  - tenancy
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: дверей не прибавилось
verification:
  - pnpm exec jest tests/tenant-isolation.guard.test.cjs: passed
changed_files:
  - tests/tenant-isolation.guard.test.cjs
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
explicit_defers:
  - none
---

# Summary

Страж пропускал каждый `findMany` — по правилу «список без фильтра бесполезен и виден сразу». Про список это правда. Про `findMany`, которым читают строку по идентификатору, — нет: проверка владения в `posts.repository.ts` читает `{ id: { in: requestedPostIds } }`, где идентификаторы прислал клиент, и организацию не называет. Запрос сделан так намеренно и объяснён в коде, но страж его не видел, а значит не увидел бы и следующий такой.

Теперь `findMany` попадает в проверку, если его `where` называет строку (ключ `id`), и по-прежнему не попадает, если описывает набор. `count` остался вне: число про всех — это не выдача чужой строки.

**Улов оказался не один.** Кроме известного запроса всплыл `admin-stats.repository.ts integration.findMany`, который никто не читал. Прочитан: это инстанс-широкая статистика за дверью `assertSuperAdmin` (`GET /admin/stats`), смысл числа как раз в том, что оно считает все организации; идентификаторы приходят из собственного `groupBy` этого же метода, а не из запроса, и обратно читается только `providerIdentifier` — имя сети. Записан в `ALLOWED` с этой причиной.

В `posts.repository.ts` изменён только комментарий, как и требовала задача.

# Scope / Routing

Добавлена закреплённая проверка: запрос проверки владения обязан оставаться в области сканирования. Сузить страж обратно до «findMany — всегда список» теперь нельзя молча.

# Verification

Красный до правки: `added` содержал оба запроса, набор падал. После записи обоих в `ALLOWED` — шесть проверок зелёные.

# Delivery / Cleanup

Возвращено корню; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

`namesARow` читает ключ `id` текстом. Запрос, у которого `where` лежит в переменной (такой случай уже записан в `ALLOWED` для `source-registry`), сканер не разберёт — он ошибается в сторону пометки, а не пропуска, и это правильная сторона.
