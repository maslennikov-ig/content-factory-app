# Public funnel implementation plan

## Scope ledger

- Public product before registration, truthful routes, safe demo → Task 1.
- Clear required fields, email-only no-write first step → Task 2.
- Chosen template applied end to end through both registration paths → Task 2.
- Six-event privacy-safe aggregate contract → Task 3.
- RU/EN, responsive themes, focused RED→GREEN, request/database evidence → Tasks 1–3 and final gate.

### Task 1: Retain and close the public product/demo surface

**Boundary:** public UI, synthetic state, claims, responsive/browser proof.
**Verification lane:** `tdd-required` — anonymous network behavior and public
claims are observable security/product contracts.

- [x] Map what `/`, `/product`, `/security`, `/docs`, and `/demo` already satisfy.
- [x] Establish focused failing proofs only for remaining gaps.
- [x] Extend, do not replace, the existing public components and review scenes.
- [x] Produce 390/1440 RU/EN, light/dark screenshots and a request ledger.

### Task 2: Progressive registration and real starter-template application

**Boundary:** registration UI/DTO/service/repository and new-workspace seed.
**Verification lane:** `tdd-required` — auth, persistence, compatibility,
idempotency, and OAuth continuation cross material risk boundaries.

- [x] Prove step one causes no account or organization write.
- [x] Preserve legacy `company` and `starterTemplate` while adding the supported continuation.
- [x] Apply one allowlisted template exactly once for LOCAL and OAuth.
- [x] Prove safe blank/default, expiry/replay, and post-registration first step.

### Task 3: Closed privacy-safe conversion aggregates

**Boundary:** public telemetry client/endpoint and trusted server events.
**Verification lane:** `tdd-required` — public payload and retained metadata are
privacy and abuse contracts.

- [x] Prove a seventh event and arbitrary property fail before implementation.
- [x] Retain exactly six events with no visitor identity or request metadata.
- [x] Record registration/activation only from trusted server transitions.
- [x] Prove rate limiting and aggregate report ratios.

### Final release gate

- [x] Review the integrated diff and each child artifact; return corrections to owners.
- [x] Run focused browser/database/network and required Docker contours.
- [x] Run one final `pnpm run build`, `pnpm test`, brand scan, docs check,
  process verification, and `git diff --check` on the final commit.
- [x] Update Beads in one closure batch, handoff, graph review, receipt, and safe cleanup.
