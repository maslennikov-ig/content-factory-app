---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-71m.6/stage-manifest.json
stream_owner: compose-memory-limits
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root-orchestrator
public_facade: n/a
bounded_acceptance: focused compose memory contract and whitespace validation
non_goals:
  - container start database network server deploy push merge or production measurement
evidence:
  - none
task_id: content-factory-next-71m.6
epic_id: content-factory-next-71m
stage_id: content-factory-next-71m.6
session_id: content-factory-next-71m.6
milestone: production-compose-memory-limits
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: reversible capacity judgment for three unequal Node processes on a shared host
repo: content-factory-next
branch: work/compose-memory-limits
base_branch: main
base_commit: 04f9f6d7
worktree: /tmp/cf-compose-memory-limits
write_zone:
  - deploy/production/docker-compose.yaml
  - var/docker/ecosystem.config.js
  - tests/production-compose-memory-limits.test.cjs
  - .codex/stages/content-factory-next-71m.6/artifacts/compose-memory-limits.md
success_criteria:
  - preserve the evidence-backed reversible compose memory budget and guard its runtime contract
selected_docs:
  - AGENTS.md
  - Beads-content-factory-next-71m.6
  - docs/prompts/codex-remaining-tasks.md
  - docs/prompts/codex-memory-and-external-services.md
selected_skills:
  - test-driven-development
  - technical-premortem
  - systematic-debugging
  - verification-before-completion
selected_agents:
  - compose-memory-limits-worker
  - compose-memory-reviewer
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - content-factory-next-71m.5
parallel_decision: sequential
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: worker completed in the root-owned task worktree; no child branch worktree or runtime resource exists to remove
risk_level: medium
risk_tags:
  - rollback
affected_surfaces:
  - backend
invariants:
  - rollback
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: compose records why the local 71m.5 RSS delta cannot lower the container cap
verification:
  - focused Node-22.23.2 Jest compose memory contract: passed
  - static docker compose config with placeholder env: passed
  - independent correctness review after both P2 corrections: accepted
  - owned-path git diff check: passed
changed_files:
  - deploy/production/docker-compose.yaml
  - tests/production-compose-memory-limits.test.cjs
  - .codex/stages/content-factory-next-71m.6/artifacts/compose-memory-limits.md
explicit_defers:
  - content-factory-next-71m.7 production cgroup memory measurement before any limit reduction
---

# Summary

Сохранить `cf-app: 1792m` и heap `512/512/256`; добавить проверяемый контракт и пояснение границы доказательств 71m.5.

# Scope / Routing

Изменения ограничены назначенной write zone. Контейнеры, база, сеть, сервер, deployment и внешние действия не запускались.

# content-factory-next-71m.6 — лимиты памяти compose

## Решение

Сохранить для `cf-app` предел `1792 MiB` и отдельные Node heap limits: backend `512 MiB`, orchestrator `512 MiB`, frontend `256 MiB`. Старое описание Beads говорит о `2 GiB` и общем `NODE_OPTIONS=--max-old-space-size=512`; это drift документа задачи относительно текущего кода. В текущем `main` уже принята более точная схема, и возвращать старую не следует.

Локальный idle-замер контейнера — `1010 MiB`; до предела остаётся `782 MiB` (около 44%). Результат 71m.5 — `IntegrationManager` снизил локальный startup RSS backend с `202.62` до `148.15 MiB` (`54.47 MiB`) — не является замером cgroup/production и не служит основанием уменьшать лимит. Нагрузку после подключения каналов также ещё не измеряли. Production-проверка отложена в `content-factory-next-71m.7`.

## Эффект для оператора

Контейнер сохраняет изоляционный предел на общем хосте: при runaway он будет ограничен раньше соседних сервисов. При этом три разных Node-процесса не получают один общий heap cap; frontend не резервирует лишнее, а backend и orchestrator не занижены до его размера.

Ручная проверка после owner-only production change: в запущенном `cf-next-app` сверить `memory.current` с пределом `1792 MiB`, затем повторить при подключённых каналах и обычной рабочей нагрузке. До этой проверки лимит не снижать.

# Risks / Follow-ups / Explicit Defers

## Technical premortem

Verdict: GO WITH CONDITIONS.

Blast radius: `docker-compose cf-app` -> PM2 backend/orchestrator/frontend -> общий хост и его соседние сервисы.

| Симптом отказа | Evidence | Механизм / поверхность | Обнаружение | Митигация | Решение |
| --- | --- | --- | --- | --- | --- |
| OOM у приложения после подключения каналов | plausible | idle не покрывает request и worker growth | `memory.current`, Docker OOM event, restart count | сохранить 1792 MiB до production remeasure | monitor, 71m.7 |
| Host pressure из-за слишком высокого лимита | confirmed | хост общий, лимиты намеренно заставляют этот стек падать первым | host/container memory telemetry | не увеличивать предел без замера и owner approval | preflight |
| Нижний предел heap ломает backend | confirmed | idle backend JS heap уже 363 MiB при ceiling 512 MiB | startup/error logs, heap statistics | оставить 512 MiB; повышать только по фактическому доказательству | monitor |
| Executor возвращает obsolete 2 GiB/global `NODE_OPTIONS` | confirmed | Beads текст отстал от текущего main | focused contract test | тест фиксирует per-process caps и запас 512 MiB | preflight |

Recovery: эта ветка не меняет числовой runtime limit, поэтому её revert удалит только комментарий и guard. Если будущий OOM потребует изменить cap, owner выбирает новое значение только по замеру `content-factory-next-71m.7` и состоянию deployed revision; эта ветка не утверждает неизвестное «предыдущее» значение. Данных, кэшей или очередей изменение не затрагивает.

# Verification

## Evidence

- docs-reviewed: `AGENTS.md`, `bd show content-factory-next-71m.6`, `docs/prompts/codex-remaining-tasks.md`, `docs/prompts/codex-memory-and-external-services.md`.
- graph-reviewed: blocked — root выполнил `graphify query`, но запрос не смог работать, потому что отсутствует `graphify-out/graph.json`.
- Focused test: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH TMPDIR=/tmp pnpm exec jest tests/production-compose-memory-limits.test.cjs --runInBand` — PASS: 1 suite, 1 test.
- `git diff --check` on tracked owned path plus `git diff --check --no-index /dev/null` for each untracked owned file — PASS (no whitespace errors).

## Affected files

- `deploy/production/docker-compose.yaml`
- `tests/production-compose-memory-limits.test.cjs`
- `.codex/stages/content-factory-next-71m.6/artifacts/compose-memory-limits.md`

## TDD note

The runtime values were already present in the accepted current baseline, so a newly added characterization contract is green from its first run; claiming an honest RED state would require deliberately breaking that baseline. The test is intentionally a durable guard against the obsolete Beads configuration, not a comment check.

Явный defer: `content-factory-next-71m.7` должен измерить production cgroup memory до любого снижения лимита.
