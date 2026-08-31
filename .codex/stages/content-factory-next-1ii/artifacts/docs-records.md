---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-1ii/stage-manifest.json
stream_owner: docs-records
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner
public_facade: n/a
bounded_acceptance: operator documentation and stage records match the code as it now stands
non_goals:
  - any change to application code, throttler, Prisma schema, retention script, frontend or test logic
  - protected landing/auth files
  - distributed abuse budget, per-provider-call metering, legal texts or a pricing decision
  - acceptance receipt, test counts, bd commands, commit, push or deploy
evidence:
  - none
task_id: content-factory-next-1ii.6
epic_id: content-factory-next-1ii
stage_id: content-factory-next-1ii
session_id: content-factory-next-1ii
milestone: documentation and stage-record repair
milestone_status: in_progress
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: many small factual corrections across auth, retention, ingress and schema surfaces, each of which has to be traced to code before it is written down
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: main
base_commit: 419b945f
worktree: /home/me/code/content-factory-next
write_zone:
  - docs/**
  - PRODUCT.md
  - .codex/stages/content-factory-next-1ii/**
  - .codex/goals/content-factory-next-1ii/**
  - .codex/stages/content-factory-next-q4p/summary.md
  - .codex/stages/content-factory-next-q4p/artifacts/telemetry.md
  - .codex/handoff.md
  - .codex/project-index.md
success_criteria:
  - No repository document claims the demo makes no outbound request, that the first account becomes an administrator, that an operator-only bootstrap process exists, or that a retention schedule exists.
  - The two different rights named SUPERADMIN are distinguished wherever either is mentioned.
  - configuration.md carries PUBLIC_GROWTH_DEDUPE_KEY, the password window, the full auth throttle table, the two-hop ingress contract, CF_SAAS_RETENTION_TARGET and the known limitations.
  - The retention runbook matches the script as it now behaves, including the target descriptor and the refusal before connection.
  - The additive SQL of this round is written down with the standing targeted-psql rule, and the AI error codes are listed where an operator will look.
  - The q4p records state only what the repository can show.
selected_docs:
  - AGENTS.md
  - CLAUDE.md
  - .codex/handoff.md
  - .codex/project-index.md
  - .codex/stages/content-factory-next-q4p/summary.md
  - .codex/stages/content-factory-next-q4p/artifacts/telemetry.md
  - working-tree diff of the five code streams
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: docs-records-after-code
depends_on_streams:
  - throttle
  - ai-usage
  - telemetry
  - public-surface
  - contract-guard
parallel_decision: sequential
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: docs-only stream, no worktree or branch of its own
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: SaaS spec, readiness, configuration, runtime, auth/tenancy, production deploy, local development and the q4p stage records were brought to the code
verification:
  - pnpm run docs:check: passed
  - node scripts/branding/brand-scan.cjs: passed
  - bash scripts/orchestration/run_process_verification.sh: passed
  - TMPDIR=/tmp npx jest tests/cloud-saas-contract.test.cjs --coverage=false: passed
changed_files:
  - docs/product/cloud-saas-growth-spec.md
  - docs/operations/saas-readiness.md
  - docs/operations/production-deploy.md
  - docs/operations/configuration.md
  - docs/operations/runtime.md
  - docs/architecture/auth-and-tenancy.md
  - docs/development/local-development.md
  - .codex/stages/content-factory-next-q4p/summary.md
  - .codex/stages/content-factory-next-q4p/artifacts/telemetry.md
  - .codex/stages/content-factory-next-1ii/spec.md
  - .codex/stages/content-factory-next-1ii/plan.md
  - .codex/stages/content-factory-next-1ii/summary.md
  - .codex/stages/content-factory-next-1ii/stage-manifest.json
  - .codex/stages/content-factory-next-1ii/artifacts/docs-records.md
  - .codex/goals/content-factory-next-1ii/scope-criterion-snapshot.json
  - .codex/handoff.md
  - .codex/project-index.md
explicit_defers:
  - content-factory-next-saas.2, .4, .5, .6 stay open and unabsorbed
  - content-factory-next-or3.2, .5, .7, .8, .9 stay open and unabsorbed
---

# Summary

Пять ложных утверждений операторской документации исправлены по коду, шесть
отсутствовавших фактов записаны, runbook retention приведён к текущему
скрипту, additive SQL и коды ошибок AI записаны там, где оператор их ищет, а
записи стадии `q4p` сведены к тому, что репозиторий может показать.

Существенно для оператора: теперь есть исполнимый порядок получения первого
администратора инстанса до открытия публичного трафика; раньше документация
обещала процесс, которого нет, и утверждала, что администратором становится
первый зарегистрировавшийся, — на публичном инстансе это не владелец.

# Scope / Routing

Write zone — только документация и записи стадий. Код, throttler, Prisma
schema, retention script, frontend и логика тестов не менялись; реестры
`tests/cloud-saas-contract.test.cjs` не потребовались, потому что ни одна
формулировка не задела охраняемые предложения.

Каждое утверждение прослежено до кода: `resolveNewUserAccess`,
`organization.repository.ts`, `throttler.provider.ts`,
`transient-client-tracker.ts`, `nginx.conf`, `Caddyfile.snippet`,
`redis.service.ts`, `cleanup-saas-retention.cjs`, `ai.usage.service.ts`,
`ai.provider.config.ts`, `public-growth.service.ts`, оба password DTO и
`synthetic-demo.tsx`.

Пятнадцать операторов SQL среза и один оператор этого ремонта получены
офлайновым `prisma migrate diff --from-schema-datamodel` между схемой `main`,
схемой `HEAD` и текущей рабочей схемой. К базе ничего не подключалось.

Documentation decision: локальная документация репозитория; внешней или
версионно-зависимой границы нет, `docs-resolve` не требовался.

# Verification

- `pnpm run docs:check` — 78 файлов, ссылки и якоря в порядке.
- `node scripts/branding/brand-scan.cjs` — прошёл.
- `bash scripts/orchestration/run_process_verification.sh` — прошёл.
- `TMPDIR=/tmp npx jest tests/cloud-saas-contract.test.cjs --coverage=false` —
  60/60.

Полный `pnpm test` и `pnpm run build` намеренно не запускались: единственный
acceptance выполняет корневой оркестратор.

# Delivery / Cleanup

Возвращено корневому оркестратору без коммита. Ветка и worktree этого потока
отсутствуют, убирать нечего.

# Risks / Follow-ups / Explicit Defers

- `workspace.current_stage_id` в `.codex/orchestrator.toml` всё ещё указывает
  на `content-factory-next-q4p`; без правки `check_stage_ready.py --stage
  content-factory-next-1ii` не пройдёт. Конфигурацию этот поток не менял.
- Пять потоков кода не оставили stage-артефактов; их доказательства — рабочий
  diff и focused-наборы, а не записи под `.codex`.
- Два `CREATE TYPE` среза не проходят режим `update` репозиторного валидатора
  по его устройству. Порядок применения записан, валидатор не менялся; если
  владелец захочет один проверяемый файл на всё, это отдельное решение.
- Receipt стадии не создавался: его владелец — корневой acceptance.
