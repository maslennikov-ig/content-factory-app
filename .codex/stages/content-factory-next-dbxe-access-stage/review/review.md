# Access stage root review — 9 October 2026

Reviewed commit `9d5700d37b8170da3420acc322ecc9fb3a6e68cd` against
`a4e5742a08c4be886f5e960d9f756d88ee098f8d`. Root-owned review and correction;
no additional agents, production mutation, credential rotation or delivery.

## Findings and correction

The five access changes are present. Original receipt inputs match all38 current
files before correction, and its logs support34 suites/554 tests including7 real
PostgreSQL cases. Inspected session/reset/activation issuance and consumers,
password CAS, organization projections, public-route policy registration,
current OAuth membership, cookie/header precedence and provider propagation.
Explicit headers already take precedence over cookies: no contradictory
authentication change is needed. Global PoliciesGuard is actually registered.

**Confirmed dbxe.5 gap:** token fan-out was tenant/family-scoped, but primary
upsert still matched only `(organizationId, internalId)`. A different provider
with that same ID rewrote providerIdentifier and credentials in the existing
channel. Connect, refresh and concurrent cross-provider creation reproduced the
overwrite on disposable PostgreSQL. All earlier7 cases passed; three new cases
failed, while the new same-provider concurrent-creation control passed.

Correction keeps the exact provider in the atomic Prisma write predicate.
Known write-conflict errors are checked against a credential-free, tenant-scoped
provider lookup; an actual provider collision produces HTTP409 with
`CF_CHANNEL_PROVIDER_COLLISION`. Other errors retain their original behavior.
The database schema and legacy unique key are unchanged. A coincident ID of a
different provider is refused safely; supporting both records under that same
legacy key is not claimed. Nothing deletes, rotates or migrates a channel.
LinkedIn account/page token sharing still applies to separate records within
the documented tenant family.

Prisma6 [documents additional predicates in WhereUniqueInput](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference#filter-on-non-unique-fields-with-userwhereuniqueinput).
The actual installed Prisma6.5/PostgreSQL behavior, including concurrent same-
and different-provider creation, was verified rather than inferred from docs.

## Acceptance

- Focused red proof:11 database tests,3 failures exposing the overwrite,
  8 passes; own fixture removed, foreign containers preserved.
- Corrected focused proof:11/11 database tests PASS, then one final affected
  set **34 suites / 558 tests PASS, zero skips**, including those11 real DB tests.
- Backend TypeScript, docs/process verification and diff checks PASS.
  This is the affected access set, not a full release suite.
- Existing `.1–.4` source behavior is unchanged. `.5` was reopened for the
  demonstrated gap and accepted again only after the corrected proof. All30
  immutable epic/child acceptance criteria and24 unselected children remain.
- Disposable PostgreSQL used an explicit loopback-only datasource. All owned
  resources were removed; no live DB, provider or model was contacted.

Evidence: `red-focused-acceptance.log`, `red-root-acceptance.actual.json`,
`focused-acceptance.log`, `root-acceptance.actual.json` and `review-acceptance.json`
in this directory. Raw logs/temporary runners remain local. Initial554-test
receipt remains historical and is not overwritten by this review.

## Next stage

Recommend the existing OPEN task **content-factory-next-dbxe.8**: triage actual
dependency applicability and apply minimum compatible fixes before delivering
the access changes. Start with the12 critical range matches, then applicable
high findings; registry counts do not establish runtime exploitability.
The Beads task's original acceptance remains intact. Prepared prompt:
`../next-stage-prompt.md`.

Production remains on its previous version; reviewed fixes are local. No full
epic completion or production acceptance is claimed. Legal/pricing/client,
research, invoice and owner-excluded backup-restoration decisions are preserved.

graph-reviewed: read-only sibling graph in `editorial-release-20261008`, based on
e2ec588d, oriented current middleware/module links; exact current files reviewed.
No graph refresh, external extraction or git hooks.
