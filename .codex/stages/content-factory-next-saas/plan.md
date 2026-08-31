# План реализации Cloud-first SaaS

**Цель:** реализовать первый безопасный end-to-end SaaS slice и долговечный
task graph без преждевременных pricing/deploy решений.

**Подход:** одна integration-стадия с тремя параллельными writer-потоками и
одним read-only architecture/premortem потоком. Schema writers идут
последовательно. Root владеет Beads, stage state, интеграцией и одним финальным
acceptance.

**Spec:** `.codex/stages/content-factory-next-saas/spec.md`.

## Scope ledger

- Cloud-first/AGPL contract и self-host claim guard -> contract/operations.
- Public routes, demo, progressive signup UI и accessibility -> public UX.
- Compatible auth, template idempotency и aggregate metrics -> auth/metrics.
- Hybrid AI mode, encrypted key isolation, quota и usage -> AI stream после
  остановки первого schema writer.
- Provider/region/legal/pricing и production -> explicit open Beads gates.

## Поток contract/operations

**Verification lane:** mixed: docs use static checks; guard behavior uses TDD.

- PRODUCT, ADR and durable product spec.
- User-facing self-host claim guard with historical/operator allowlist.
- Managed legal/support/security and operations readiness documents without
  fabricated certifications, SLA or residency.

## Поток public UX

**Verification lane:** TDD-required for routing, demo behavior, signup states
and accessibility.

- Public shell and routes `/`, `/product`, `/security`, `/docs`, `/demo`.
- Synthetic plan -> draft -> review -> schedule demo with no backend mutation.
- Email-first UI and handoff to final registration without email in URL.
- RU/EN plus complete locale key coverage and 1440/1024/768/390 behavior.

## Поток auth/metrics

**Verification lane:** TDD-required for public API, validation, transaction,
idempotency, privacy and tenant boundaries.

- Backward-compatible registration DTO and organization naming precedence.
- Allowlisted starter template applied once.
- Anonymous coarse growth aggregate and trusted server events.
- Additive Prisma migration only; never db push or production apply.

## Поток hybrid AI

**Dependency:** begins production edits only after auth/metrics schema writer
stops.

**Verification lane:** TDD-required for secrets, tenant isolation, quota,
usage and explicit no-fallback behavior.

- Add explicit mode and included provider configuration.
- Preserve encrypted workspace keys and masked browser response.
- Central resolver selects exactly one credential source.
- Persist privacy-safe usage without prompt/output and show restricted state.

## Корневая приёмка

- Review every stream diff, artifact and red/green evidence.
- Run one risk-selected integration acceptance with Node 22.23.2, pnpm 10.6.1
  and `TMPDIR=/tmp`: focused suites, `pnpm test`, `pnpm run build`, brand scan,
  docs check, process verification and `git diff --check`.
- Run browser proof only against local synthetic data; no accounts, credentials,
  external calls or production.
- Update Beads and handoff from accepted evidence; keep provider/region/legal,
  pricing and unresolved core-product work open.

