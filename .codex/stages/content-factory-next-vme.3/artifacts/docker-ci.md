---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.3/stage-manifest.json
stream_owner: subagent:docker-ci
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-vme.3.docker-ci
stage_id: content-factory-next-vme.3
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 4588f020
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Disposable Docker resources and temporary proof files were removed; root reran the executable contract, syntax, artifact and scoped diff checks.
risk_level: high
risk_tags:
  - ci
  - infrastructure
affected_surfaces:
  - ci
invariants:
  - fail-closed
verification:
  - 'RED: pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs (exit 1; 4/4 failed because the required job and runner were absent)'
  - 'GREEN: pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs (4/4 passed)'
  - 'HARDENED CONTRACT: pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs (5/5 passed; nginx image preflight/pull, three suite paths and zero-skip guard covered)'
  - 'REAL: ./scripts/ci/run-docker-backed-ci.sh --require-docker (3 suites, 31 tests, 0 skipped; both operational proofs passed; cleanup empty)'
changed_files:
  - .github/workflows/build.yml
  - scripts/ci/run-docker-backed-ci.sh
  - scripts/ci/assert-docker-jest-result.cjs
  - tests/docker-ci-contract.test.cjs
  - docs/development/docker-backed-ci.md
  - .codex/stages/content-factory-next-vme.3/artifacts/docker-ci.md
explicit_defers:
  - production-scripts
  - package-json
  - delivery-and-push
---

# Summary

Добавлена отдельная обязательная GitHub Actions задача
`Docker-capable execution proofs (required)`. Она вызывает один fail-closed
runner с Node 22.23.2 и pnpm 10.6.1. Runner проверяет Docker daemon, Compose и
наличие `postgres:17-alpine` и `nginx:alpine`, запускает три реальных
Docker-backed Jest-набора, отклоняет любой pending/skip в машинном результате
Jest и затем поимённо выполняет:

- `scripts/operations/verify-mastra-storage-migration.sh`;
- `scripts/operations/verify-postgres-backup-restore.sh`.

Локальный запуск без `--require-docker` сохраняет допустимый no-Docker режим,
но печатает точную причину пропуска. CI-режим при тех же условиях завершается
ошибкой. Production/deploy scripts, `package.json`, secrets и внешние среды не
изменялись.

# Verification

## Наблюдаемый RED

Команда:

```text
pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs
```

До реализации: exit 1, 1 suite failed, 4/4 tests failed. Главный отказ:
workflow не имел job `docker-backed-operations`; текущая `build` job могла
завершиться с кодом 0 в fixture без Docker proof. Также отсутствовали runner и
защита результата Jest.

## Минимальный GREEN

Та же команда после реализации: exit 0, 1 suite passed, 4/4 tests passed.
Контракт исполняет настроенные `run` steps в изолированном fixture и проверяет
коды выхода и реальный журнал вызовов, а не ищет строки в исходниках.

Покрыты мутации: удаление обязательной job, снятие `--require-docker`, принятие
зелёного Jest с `describe.skip`, удаление любого из двух Jest-путей или любой
из двух operational proofs.

## Реальный Docker-run

```text
./scripts/ci/run-docker-backed-ci.sh --require-docker
```

Результат после hardening: exit 0; 3/3 Jest suites, 31/31 tests, 0 skipped.
Матрица теперь включает реальный nginx proxy-hop browser relay. Реальная миграция
Mastra подтвердила точные 29 таблиц, функцию/триггер, данные и fail-closed
ветви missing/extra/dependency/retry. Реальный dump/restore подтвердил все базы
и роли. Обе проверки сообщили успешную очистку контейнеров, сети, томов и
временных артефактов.

Документация опирается только на существующий синтаксис workflow и текущее
исполняемое поведение репозитория; внешние versioned утверждения не вводились.

# Risks / Follow-ups

CI runner явно получает `postgres:17-alpine` и `nginx:alpine`, если образов ещё
нет на runner. Локальный режим ничего не скачивает. GitHub delivery и реальный запуск
удалённого workflow остаются за orchestrator; этот поток не выполнял push/PR.
