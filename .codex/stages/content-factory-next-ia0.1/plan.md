# План ремонта независимого аудита ia0

**Цель:** исправить все подтверждённые дефекты goal-objective без изменения
принятой истории `content-factory-next-ia0`.

**Подход:** одна release-стадия на уже интегрированной ветке acceptance. Три
изолированных writer-потока выполняют red-green параллельно; поток честности
трекера и доказательств идёт после их остановки. Корень принимает diffs и
выполняет один полный acceptance.

**Не цели:** landing-page redesign (его ведёт отдельный пользовательский агент),
новое product behavior, epic `or3`, production, deployed database, accounts,
credentials, paid calls, merge, push, PR или deploy.

**Spec:** `.codex/stages/content-factory-next-ia0.1/spec.md`.

## Scope ledger

- Mastra, runbooks, ACL restore, docker/cleanup robustness -> поток 1.
- Relay, per-client abuse isolation, Stripe terminal paths -> поток 2.
- Marks, Input, calendar/error payload, design guards, visual proof -> поток 3.
- Branch pin, evidence honesty, close reasons и successors -> поток 4.
- Один release acceptance и untouched-owner audit -> корневой gate.

## Поток 1: migration и recovery

**Boundary:** independent database migration/recovery risk; rollback is the
stream commit; operator actions remain docs-only.

**Verification lane:** `tdd-required` — migration set, restore ACL и transaction
shape являются data/security контрактами.

- [x] Red proof: exported schema set differs from 29 deployment tables.
- [x] Generate source DDL with `pg_dump`, verify the exact set, and run a real PostgreSQL 17 source/target migration proof.
- [x] Restore database ACLs and assert PUBLIC/runtime isolation.
- [x] Correct four-column/two-index User runbook and link exact `--allow-table User` procedure.
- [x] Use a batched Prisma cleanup transaction; record Docker-absent CI policy in `content-factory-next-wui`.

## Поток 2: relay и billing reliability

**Boundary:** privacy-safe ingress and committed billing mutation handling;
no production collector or Stripe calls.

**Verification lane:** `tdd-required` — browser request semantics, throttling
and money-adjacent webhook results are observable contracts.

- [x] Red proof imports the client request builder/options and reaches relay origin validation.
- [x] Remove the referrer-policy root cause; record the privacy-reviewed per-client limiter decision in `content-factory-next-rpt`.
- [x] Make missing organization/event actor terminal after mutation while preserving storage failures.

## Поток 3: UI, error presentation и guards

**Boundary:** current design system and user-visible error/channel/calendar
surfaces; no landing-page files or visual-direction change.

**Verification lane:** `tdd-required` — accessibility, layout, classifier and
dark-theme readability are user-visible.

- [x] Add a neutral plate for the three affected vector marks without recolour/redraw; track YouTube provenance in `content-factory-next-6er`.
- [x] Add explicit Input `fieldClassName` for outer layout while preserving historical control `className`; remove empty standalone error gutter.
- [x] Give `+N` a valid accessible role/name.
- [x] Classify Temporal JSON via `cause.type` and render only safe allowlisted Calendar messages.
- [x] Close cheap guard blind spots across libraries, `rounded-3xl`, and all inherited Tailwind color aliases without growing ledgers.
- [x] Record the authenticated screenshot blocker honestly in `content-factory-next-8e7`; claim no channel-picker browser coverage.

## Поток 4: process, tracker и evidence honesty

**Dependency:** runs after streams 1–3 stop so reasons describe accepted facts.

**Verification lane:** mixed — process guard changes use focused red-green;
Beads/docs/evidence corrections use exact readback.

- [x] Restore durable main pin and detached-HEAD-safe test behavior.
- [x] Withdraw or replace the mislabeled light-1024 evidence; record that prior visual coverage was `/auth` only.
- [x] Prepare evidence-specific close reasons and open bounded successors for remaining `g1d`, `5fn`, `34r` scope; root performs the single close batch.
- [x] Record every second-tier defer with reason; do not touch owner-blocked ids, `71m.7`, parent epics or `or3`.

## Корневая приёмка

- [x] Review each diff and focused red/green evidence; return corrections to owner.
- [x] Run exactly once with Node 22.23.2, pnpm 10.6.1 and `TMPDIR=/tmp`:
  `pnpm test`; `pnpm run build`; `node scripts/branding/brand-scan.cjs`;
  `pnpm run docs:check`; `bash scripts/orchestration/run_process_verification.sh`;
  `git diff --check`; clean `git status`.
- [x] Run one independent risk review for migration/security/billing and resolve every finding.
- [x] Stop all agents, update central artifacts immediately, close Beads in one
  batch, `bd dolt push`, and verify each changed id with `bd show`.
