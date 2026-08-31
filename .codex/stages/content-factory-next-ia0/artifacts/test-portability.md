---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0/stage-manifest.json
stream_owner: test_portability
orchestration_level: inner_loop
scope_kind: product_slice
task_id: content-factory-next-ia0.test-portability
epic_id: content-factory-next-ia0
stage_id: content-factory-next-ia0
repo: content-factory-next
branch: codex/remaining-technical-debt
base_branch: codex/remaining-epic-coordination
base_commit: 07170871a4c6228e008d59319ac786a6171d66ee
worktree: /tmp/cf-ia0-technical
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: The shared technical worktree and thematic branch are retained as required local deliverables; deleting either needs separate user approval.
risk_level: medium
verification:
  - focused-red-reproducer-recorded
  - focused-green-passed
  - parallel-branding-purge-repeats-passed
  - diff-check-passed
changed_files:
  - tests/postgres-backup.wrapper.execution.test.cjs
  - tests/branding.test.cjs
  - .codex/stages/content-factory-next-ia0/artifacts/test-portability.md
explicit_defers:
  - No external documentation lookup: purely local test portability/concurrency work.
---

# Summary

Закрыты только `content-factory-next-ue2` и `content-factory-next-c7l`.

- `ue2`: capability probe создаёт файл в том же временном каталоге, применяет
  `chmod 0644` и проверяет наблюдаемый executable bit. Только зависимый тест
  `dumpExecutable=false` пропускается на FS, которая не сохраняет этот bit;
  причина указана в имени skipped-группы. Production wrapper не изменён.
- `c7l`: реальные branding fixtures создаются в `os.tmpdir()`. В дереве
  репозитория остаются только временные symlink-точки для существующего scanner
  contract; они не удаляются до `afterAll`, поэтому purge не получает ENOENT
  при параллельном запуске.

# RED

- `export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH TMPDIR=/tmp; node -v`
  -> `v22.23.2`.
- `pnpm exec jest --runInBand tests/postgres-backup.wrapper.execution.test.cjs`
  на ext4 воспроизвёл baseline 12/12 green; capability mismatch требует FS
  без executable-bit preservation и на ext4 намеренно не воспроизводится.
- `pnpm exec jest tests/branding.test.cjs tests/external-services.purge.test.cjs --maxWorkers=2`
  в 30 повторениях не поймал timing-sensitive гонку (baseline green); причина
  подтверждена source-level: branding удалял файл из дерева между обходом и
  чтением purge. Это корректный timing-sensitive reproducer command.

# Verification

## GREEN

- `pnpm exec jest --runInBand tests/postgres-backup.wrapper.execution.test.cjs tests/branding.test.cjs tests/external-services.purge.test.cjs`
  -> 3 suites, 53/53 tests passed.
- Параллельный targeted command для branding + purge с `--maxWorkers=2`, 5
  повторов -> 5/5 passed.
- `git diff --check` -> passed.
- После тестов repository fixture paths отсутствуют; временный fixture root
  очищается в `afterAll`.

# Risks / Follow-ups

Не менялись production wrapper, deploy, application code, package files,
Beads, базы, credentials, assets или файлы вне write zone. Full `pnpm test` и
build не запускались по заданному ограничению.

# Orchestrator acceptance

Принято после чтения коммита `b72fbf9a742c8de3cc18f86809ad1335a5ff30c5`
и его полного diff. Изменения ограничены двумя назначенными тестами и этим
артефактом; production wrapper и код продукта не затронуты. Фактические файлы
branding fixtures теперь находятся под `os.tmpdir()`, а symlink-точки в дереве
не считаются файлами обходчиком purge, поэтому исходная гонка чтения удалённого
файла устранена. Worktree сохранён для следующего зависимого потока; cleanup
безопасно остаётся `pending`.
