# Stage `content-factory-next-rmp` — linked sign-in identities

**Status:** accepted locally, not merged or deployed
**Branch:** `work/user-identity`
**Base:** `main` at `53fc73c673abe552b71116454e494aa5538416cd`
**Model:** Сол

## User outcome

An authenticated user can see connected and available sign-in methods in a
dedicated Settings tab, add email/password or an enabled external provider,
and remove a method without being allowed to remove the last route back into
the account. Sign-in resolves the additive `UserIdentity` table first and
retains legacy primary fields for compatibility.

Existing accounts are not changed by this branch. The supplied backfill is
dry-run-first and was not run against any database. Its apply mode requires an
explicit maintenance-window assertion and performs a post-apply dry run.

## Manual verification

1. Sign in locally and open Settings → Sign-in methods.
2. Confirm the current method is `Connected`, other enabled methods are
   `Available`, and the only method cannot be removed.
3. Add email/password to an external-provider account; sign out and sign in
   with the new email/password.
4. Connect a configured provider from the same authenticated tab, return to
   `/settings`, and confirm it appears once.
5. Remove either method while another remains, then confirm both the remaining
   login and password reset still work.
6. On a narrow viewport confirm rows stack, controls remain at least 44px high,
   and a long local identifier wraps without horizontal scrolling.

Real provider callbacks and a real PostgreSQL backfill remain owner-operated
integration checks; neither was invoked here.

## Design reference comparison

Selected evidence is saved at
https://www.lazyweb.com/agentic-search/8a4544ef-e871-4025-87f2-0dff0d53e625.

| Reference | Pattern retained | Deliberate difference |
| --- | --- | --- |
| Okta Security Methods (`screens:a723ce94da46466c5d49732b`) | Calm, flat method rows instead of equal card tiles | The last-method guard is explained inline because losing access is irreversible for the user. |
| Google connection control (`screens:2dd925f0143b7e88a544af2f`) | Status and one direct action share the same row | An external opaque identifier is described as a verified provider account, never presented as an email. |
| Zapier security settings (`screens:24ecb78136b8b8e5a1d6fc03`) | A dedicated Settings destination with no nested navigation | The tab uses the product's existing side-navigation structure. |
| Gusto account preferences (`screens:8663bc6bb94511a1fb8fb354`) | Missing methods show `Available`; LOCAL fields open under that row | LOCAL validation and recoverable errors remain within the same surface. |

The final independent comparison found no material P0–P3 divergence in the
current component, including mobile stacking, touch targets, identifier
wrapping, status/action density, and protected removal.

## Acceptance

Canonical task gates are recorded by
`.codex/stages/content-factory-next-rmp/acceptance-receipt.json`:

- `pnpm test`
- `pnpm run build`
- `node scripts/branding/brand-scan.cjs`
- `bash scripts/orchestration/run_process_verification.sh`

Focused RED/GREEN evidence and independent security, correctness, and UI
reviews are detailed in `implementation.md` and the artifacts directory.

## Decisions and residual risk

- Owner-delegated decision: LOCAL identity keys use normalized email instead
  of legacy `providerId`, because existing LOCAL rows use empty or null
  provider IDs and would collide under the required uniqueness constraint.
- Owner-delegated decision: methods live in a separate Settings tab, matching
  the reference evidence and avoiding profile-form submit/focus coupling.
- Serializable unlink and conflict retry are tested through fakes, not a live
  PostgreSQL contention proof.
- OAuth callback configuration must still be verified with each real provider
  before deployment.

## Documentation and graph review

`docs-reviewed: updated - docs/operations/user-identity-backfill.md documents the dry-run-first, maintenance-gated owner procedure; stage artifacts record the auth and UI contracts.`

`project-index: reviewed-no-change - existing Identity and tenancy, Settings, Prisma, and operations entrypoints already route readers to every changed subsystem; an unmerged feature branch should not replace stable navigation.`

`graph-reviewed: no-change-needed - Graphify 0.9.45 and the existing local code graph (7052 nodes, 16447 edges, zero model tokens) were checked and queried for the legacy UsersRepository, OrganizationRepository, AuthService, and UsersController topology. The report is stale relative to this unmerged slice, so policy defers refresh until an accepted integration or release boundary; no external semantic backend, query logging, or Graphify Git hook was used.`

Correction to the original text of this section, which claimed
`.codex/handoff.md` was unchanged. It is not. This branch also changes
`.codex/orchestrator.toml` — `current_stage`, `current_stage_id`, `base_commit`,
`legacy_active_stage_id` and the `completion_inbox` paths. That is exactly the
stale integration state the sentence said it was avoiding: seven review branches
grew from one base, five are already merged, and this branch's copy of both
files still describes a world where rmp is the only stage in flight.

Neither file is touched by the follow-up fix commit, because the fix is not
allowed to write shared orchestration state. Whoever integrates this branch
should take `.codex/handoff.md` and `.codex/orchestrator.toml` from the merge
target and drop this branch's versions. Nothing in the product depends on
either file.

## Explicit defers

None for this task. Production schema application, backfill execution, provider
credential wiring, deployment, merge, and push are explicitly outside this
local branch and were not performed.
