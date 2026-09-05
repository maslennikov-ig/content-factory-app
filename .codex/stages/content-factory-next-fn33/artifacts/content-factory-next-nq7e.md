---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-R
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: релизная процедура docs/operations/production-deploy.md
public_facade: release scripts validate the tag before ssh, refuse a missing CF_IMAGE line, read the release marker from the container, and keep only images of the running repository; both guards execute the scripts with stubbed docker/ssh
bounded_acceptance: два стража выполняют скрипты на подменённом хосте и краснеют без правок
non_goals:
  - никаких действий на боевом хосте, ssh, docker или базе
  - Playwright и интерфейс не затрагиваются
evidence:
  - release-marker-agreement-executing
  - host-artifact-retention-executing
  - release-host-stub
task_id: content-factory-next-nq7e
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: скрипты выпуска отказывают вместо того, чтобы молчать
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: shell-скрипты с удалённым исполнением и стражи на подмене PATH
repo: content-factory-next
branch: worktree-agent-a8d545339d966d08f
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8d545339d966d08f
write_zone:
  - scripts/release/**
  - tests/release-*.cjs
  - tests/host-artifact-retention*.cjs
  - tests/helpers/**
  - docs/operations/roles-ai-usage-schema-apply.sql
  - docs/operations/production-deploy.md
success_criteria:
  - тег с метасимволом останавливает switch-host-image.sh до первого ssh
  - отсутствующая строка CF_IMAGE= — отказ, а не молчаливый пропуск
  - маркер сверяется по контейнеру, а не по app.env
  - retain-host-artifacts.sh отказывается, если работающий образ не из нашего репозитория
  - хотя бы один страж выполняет скрипт со стабами docker/ssh
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: временные копии скриптов лежат в scratchpad, в дереве не осталось
risk_level: high
risk_tags:
  - security
  - rollback
  - idempotency
  - migration
affected_surfaces:
  - release-scripts
  - operations-docs
invariants:
  - rollback
  - idempotency
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: production-deploy.md — описание поведения обоих скриптов и стражей; roles-ai-usage-schema-apply.sql — IF NOT EXISTS и запись о применении на боевом
verification:
  - "pnpm exec jest tests/release-marker-agreement.guard.test.cjs tests/host-artifact-retention.guard.test.cjs": passed
  - "pnpm exec jest tests/mastra-migration.execution.test.cjs tests/user-identity.contract.test.cjs tests/error-collection.privacy.test.cjs tests/prisma-single-apply-path.test.cjs tests/repository-addresses.test.cjs tests/product-events.backend.test.cjs": passed
  - "python3 -m unittest tests.test_docs_links": passed
  - "bash -n scripts/release/switch-host-image.sh scripts/release/retain-host-artifacts.sh": passed
changed_files:
  - scripts/release/switch-host-image.sh
  - scripts/release/retain-host-artifacts.sh
  - tests/helpers/release-host-stub.cjs
  - tests/release-marker-agreement.guard.test.cjs
  - tests/host-artifact-retention.guard.test.cjs
  - docs/operations/roles-ai-usage-schema-apply.sql
  - docs/operations/production-deploy.md
explicit_defers:
  - "шаг «Добавление значения в существующее перечисление» в production-deploy.md показывает общий шаблон ALTER TYPE ... ADD VALUE без IF NOT EXISTS; строка вне выданной зоны записи (там описан не скрипт), поэтому не тронута"
---

# Summary

Четыре отказа, которых у скриптов выпуска не было, и стражи, которые их
проверяют исполнением.

`switch-host-image.sh` теперь проверяет тег **до первого `ssh`** (только буквы,
цифры, точка, подчёркивание, дефис; не длиннее 128; не с дефиса или точки),
отказывается, если в `.env` нет строки `CF_IMAGE=` (и сверяет строку после
правки), и читает `CONTENT_FACTORY_RELEASE` **у контейнера** через
`docker compose exec -T cf-app printenv`, а не из только что записанного
`app.env`; файл сверяется тоже, вторым, потому что из него возьмёт значение
следующий перезапуск.

`retain-host-artifacts.sh` отказывается, если работающий образ не из нашего
репозитория: весь расчёт удержания строится вокруг работающего тега, и чужой
тег означал бы удержание не того ряда.

`roles-ai-usage-schema-apply.sql`: `ADD VALUE IF NOT EXISTS`, чтобы повторный
прогон части А не падал на `already exists`. В заголовке записано, что файл уже
применён на боевом **03.09.2026, выпуск `a63227c58446`** — дата проверена по
`production-deploy.md` (разделы «Выпуск `a63227c58446` 03.09.2026» и
«Добавление значения в существующее перечисление»), а не по постановке задачи,
где было сказано «04.09».

# Scope / Routing

Внешняя документация не нужна: `bash`, `docker` и `psql` здесь используются в
том виде, в каком они уже стоят в этом репозитории, а поведение проверяется
исполнением на подмене, а не по описанию поставщика. Единственное версионное
место — `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, поддержанное PostgreSQL с
9.6; на боевой стоит 17.

# Verification

Стражи прогнаны и на исправленных скриптах (зелено), и на версиях из `HEAD`
(красно) — красное показано намеренно, до правки:

- `tests/release-marker-agreement.guard.test.cjs` на скрипте из `HEAD`:
  **9 из 21 падает** — шесть случаев тега, отсутствующая строка `CF_IMAGE=`,
  чтение маркера у контейнера и устаревший маркер в контейнере. Тег
  `abc$(touch $CF_STUB_DIR/injected)` на старом скрипте **действительно создал
  файл**: подстановка выполнилась в удалённой оболочке внутри
  `docker image inspect …:${tag}`. Цель подстановки нарочно направлена в каталог
  стаба, чтобы набор не портил машину, на которой идёт.
- `tests/host-artifact-retention.guard.test.cjs` на скрипте из `HEAD`:
  **2 из 23 падает** — чужой репозиторий и образ по digest проходили как
  успешный прогон.
- После правок: 44 из 44 зелёных на обоих наборах.

`tests/helpers/release-host-stub.cjs` — фальшивый хост: `ssh` выполняет
удалённую команду локально во временном каталоге, играющем роль
`/srv/content-factory-next`, `docker` отвечает из маленького каталога состояния
и **падает на любом вызове, которого не знает**, чтобы новый способ звать
docker всплывал как красный тест, а не как молчаливый успех. Сети в файле нет,
`CF_DEPLOY_HOST=stub@fake-host` видит только стаб.

# Delivery / Cleanup

Один коммит на своей ветке. Боевого хоста, ssh, docker и базы поток не касался.

# Risks / Follow-ups / Explicit Defers

- Допущение, которое подтверждает владелец одной строкой: тег выпуска — всегда
  двенадцать символов короткого коммита, поэтому набор разрешённых символов
  сужен до `[A-Za-z0-9._-]`. Если когда-нибудь понадобится тег со слешем
  (например, полное имя из другого namespace), скрипт его теперь отвергнет.
- `switch-host-image.sh` зовёт `docker compose exec -T cf-app printenv`. Если на
  хосте имя сервиса когда-то станет не `cf-app`, отказ будет на сверке маркера,
  а не на переключении: переключение к тому моменту уже произошло.
- Стражи по-прежнему не доказывают поведение на настоящем `docker`. Они
  доказывают, какие команды скрипт отдаёт и как он реагирует на ответы.
