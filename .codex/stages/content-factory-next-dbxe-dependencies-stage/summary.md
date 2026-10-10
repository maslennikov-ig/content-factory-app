# dbxe.8 local dependency remediation

Local implementation and affected executable acceptance PASS. Beads owns status;
original dbxe.8 acceptance and the full epic criteria remain intact. Full next
release acceptance is a separate gate; this stage does not deploy.

Baseline:12 critical /131 high production-graph range records. Patched manifest
and frozen install remove120 of143 baseline records. Retained2 critical /21 high
production records have explicit platform/caller/build-only exceptions. Shipped
dev graph additionally retains3 critical dormant Vitest/Tinypool records. There
is no claim that every advisory or platform library is eliminated.

The new actual-library test reproduces7 baseline failures. Fourteen corrected
security/compatibility checks pass diagnostically; final39 Jest suites/607 tests +47 Node tests, four production builds and
extension Vite/Python ZIP PASS, zero skips. System zip is absent; original
packaging-command failure is retained, no false PASS. Next login200/image400
on loopback and own process removed. Canonical docs/process/diff PASS; accepted locally. full next-release acceptance remains separate. No application/API/Temporal/schema refactor.

docs-reviewed: updated - exact versions, official sources, caller/platform
dispositions, compatibility and release gate are recorded in
docs/operations/dependency-security-remediation.md; documentation-decision:
official registry and upstream advisory lookup for Next16.3.8, Sharp0.35.5,
Multer2.3.0, Nodemailer10.0.6 and all scoped transitive version lines, recorded
in applicability.json and official-metadata.local.json. No blind latest/fix.

graph-reviewed: used - local46ec4108 graph, bounded start() neighborhood in
apps/backend/src/main.ts; exact source/config/lock and installed parent files
confirmed. Graph source hashes matched the queried HTTP entrypoint and parser
consumers except changed Sentry initialization. No refresh/external extraction.

Current scope is root-owned; no delegated streams or unrelated worktree cleanup.
Stop for owner choice after local acceptance and scoped local delivery.
