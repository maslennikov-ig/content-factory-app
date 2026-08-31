# План ремонта Cloud-first SaaS review

**Цель:** закрыть R1-R18 одним integration-stage с одним итоговым acceptance.

**Подход:** пять Beads issues соответствуют пяти независимым группам review.
Четыре write-isolated потока идут параллельно. Telemetry начинается после
signup hardening, потому что оба используют общий privacy-safe tracker.

**Spec:** `.codex/stages/content-factory-next-q4p/spec.md`.

## Scope ledger

- R1/R2/R9 -> `content-factory-next-q4p.1`, routing stream.
- R3/R4/R8/R18 -> `content-factory-next-q4p.2`, signup stream.
- R5/R6/R10/R15/R17 -> `content-factory-next-q4p.3`, AI stream; R6 durable
  wording is written by guards/docs to avoid PRODUCT/spec overlap.
- R7/R13/R14 -> `content-factory-next-q4p.4`, guards/docs stream.
- R11/R12/R16 -> `content-factory-next-q4p.5`, telemetry stream after signup.
- Deferred release/product decisions -> existing open gates, unchanged.

## Поток routing

**Verification lane:** TDD-required.

- Establish focused failures for invite handling, signed-in root and public
  sign-in entry.
- Change only proxy, public shell/copy and focused public routing tests.
- Preserve landing-agent protected files.

## Поток signup hardening

**Verification lane:** TDD-required for auth, validation and abuse controls.

- Apply privacy-safe per-caller throttling to register/forgot without changing
  the separate abuse-budget gate.
- Enforce 12 characters only for new LOCAL registration.
- Read approval from body when the response header is unavailable.
- Remove first-registration SUPERADMIN bootstrap and add operator/readiness
  steps.

## Поток AI usage

**Verification lane:** TDD-required for lifecycle, quota and DI boundaries.

- Align `.env.example` and configuration docs with actual included credentials.
- Keep admission open until Mastra/provider execution completes.
- Correct quota=0 language and replace module-level PrismaClient with DI.
- Preserve explicit mode isolation and no fallback.

## Поток guards/docs/i18n

**Verification lane:** TDD-required for claim/i18n guards; docs-only changes do
not add source-grep tests beyond the existing executable guards.

- Expand undecided-claim recognition for the four reported strings.
- Route public and provider copy through the shared translation contract for
  every shipped locale.
- Correct demo/PostgreSQL wording and narrow the test title.
- Record R6 operation-counter semantics in PRODUCT and SaaS spec.

## Поток telemetry

**Dependency:** signup stream returns the shared tracker contract first.

**Verification lane:** TDD-required for concurrency, privacy and deletion.

- Retry daily aggregate P2002/P2034 separately from event uniqueness.
- Use the shared transient tracker and log exhaustion.
- Key trusted dedupe with operator configuration and add 90-day operator-owned
  dry-run/apply retention for trusted growth and AI usage.
- Generate any SQL only from offline Prisma migrate diff and run it through the
  existing guard; apply nowhere.

## Корневая приёмка

- Review each returned diff and v3 stream artifact; corrections go to the same
  owner.
- Run focused suites for every changed surface, then under Node 22.23.2,
  pnpm 10.6.1 and `TMPDIR=/tmp`: `pnpm test`, `pnpm run build`, brand scan,
  docs check, process verification and `git diff --check`.
- Confirm all four protected files are untouched, refresh Graphify locally,
  create a new stage receipt, close the Beads batch, `bd dolt push`, then
  re-read every issue with `bd show`.
