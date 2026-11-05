# CTA attribution and Helixa exchange v1

`SocialFactoryAttributionService` reuses current publishing capabilities and
`ShortLinkService`. It creates deterministic campaign references and native
UTM links. Profile CTAs are account-level, shared links campaign-level, and
verified distinct publication links post-level. Shorts descriptions, internal
related-video links and Instagram captions do not provide external click
attribution. YouTube long descriptions additionally need confirmed advanced
features. Story link stickers are not assumed from a Business account alone.
A shortener claim is persisted before submission; a lost response is reconciled
through existing tagged-link reads, never blindly resubmitted.

Click totals require current capability and the exact link in the published
revision, or remain unknown. They are link events, not unique people or money.
Manual CRM links retain the actual actor/evidence reference and
`confidence:owner_reported`. Native `ContentLead` is editorial research intake,
not CRM customer lead infrastructure, and is not repurposed as a customer table.

`SocialFactoryHelixaExchangeService` matches the separately delivered native
Helixa endpoint `/api/content-factory/exchange/v1` and protocol
`helixa.content-factory.exchange.v1`. It sends an expected-organization fence checked by Helixa before opening stores or applying a mutation, and pins both tenants/project/operations in responses,
uses strict request/response schemas, bounded HTTPS/no-redirect transport and
revalidates every use. There is no persisted company-memory or CRM text cache.
Unavailable/denied/missing evidence erases the current-copy authority; old data
is never a disconnected fallback. Opportunity value, won status, received
payments, refunds and currency remain distinct. Payment stays explicitly
`unavailable` until canonical payment/refund receipts exist.

## Exact CRM tracking

New CF links reserve `utm_term` for their existing opaque `cf_ref` link ID.
An existing conflicting `utm_term` is rejected before saving a link, preserving
the owner's value. Existing links are never rewritten; older links without
the exact token remain unavailable for this join.

`readAttributedOutcomes(organizationId, linkId, {projectId, recordIds})` reads
the actual persisted local link and checks expiry, current campaign/account CTA
capability and, for post scope, the exact URL in the current published revision.
It works without a paid click-statistics provider. Profile links keep account
scope and shared links keep campaign scope. The native CRM result is a retained
UTM association, not proof of a click, unique person, causality or cash.

The reviewed session binding may provide optional `crmTracking` configuration:

```json
{
  "sourceId": "the-reviewed-canonical-crm-source-id",
  "fields": {
    "link": "provider-field-ref-for-UTM_TERM",
    "campaign": "provider-field-ref-for-UTM_CAMPAIGN",
    "source": "provider-field-ref-for-UTM_SOURCE",
    "medium": "provider-field-ref-for-UTM_MEDIUM",
    "content": "provider-field-ref-for-UTM_CONTENT"
  }
}
```

Field references must be distinct; `content` is mandatory for post scope.
These are provider field identities reviewed for this exact CRM source, never
labels or model-supplied values. No actual mapping has been configured.

The service builds optional `trackingMatch` on existing native
`crm.outcomes.read`, contract `content-factory.crm-tracking.v1`. The native
exchange reads current canonical source attributes, requires one exact parent
snapshot with tenant/project/source/evidence/revision identity, compares every
configured field exactly and checks native source/provider rights, including
independent sparse-field evidence. Missing, ambiguous, stale or denied matches
remain `canonical_tracking_link_absent`. Only the matched fields and lineage
are exported; unrelated attributes and customer identities are excluded.

CF's strict consumer pins the result to the requested link/level, complete
field set and exact outcome provenance. It rechecks local link authority after
the native read. Public generic `exchange` rejects caller-built `trackingMatch`;
old v1 reads without tracking remain supported. No previous CRM copy is served
on failures.

The existing `/social-factory/helixa/read` API and `helixa.read` chat capability
accept optional `attributionLinkId` for `crm.outcomes.read` with an explicit
project. They call this server-owned method; requests cannot supply field
proofs or select the external tenant.

## Outstanding payment implementation

The owning-source audit was checked against Helixa `origin/stage`
`59654ee2548099b42990512d19825ca6a2bd2065` on 2026-11-03; the relevant
Domain, Kommo, Roistat and Metering files are unchanged from this exchange's
base. Canonical BusinessRecord supports deal/task/party/activity. Kommo
`price` becomes deal value, not a received-payment event. Its standard UTM
tracking fields are already projected as same-deal source attributes with
tenant, source, exact parent revision and evidence lineage. The exact mapping
above reuses those attributes; a CRM lead-source label alone is not one.

Roistat's real connector supplies attributed aggregate metrics with a period,
model and provenance. It does not provide a typed canonical payment/refund
receipt projection. The Kommo/Roistat offline reconciliation is fixture-only,
and Helixa Metering records application/model-provider spending, not customer
payments. None establishes an exact publication-to-cash trace.

Task `content-factory-next-ekqe.13` therefore remains open for implementation:

- Define and ingest genuine payment/refund receipts from the selected actual
  source, retaining tenant/project/source/event identity and revision,
  payment/refund status, amount in minor units, currency, event/observed time,
  canonical deal/order linkage, evidence and a refund-to-payment reference.
  Handle replay, corrections and current access/deletion explicitly.
- Extend the versioned native exchange and its strict CF consumer together once
  those authoritative payment records exist. Cover partial payments, refunds,
  currency differences, source revision/revocation, tenant isolation,
  missing-versus-zero and won-deal-versus-received-payment cases.

No payment provider/account or actual attribution mapping was invented or
activated. Live tracking acceptance needs a reviewed real field mapping and
connected evidence. Configuring the current session binding cannot satisfy the
separate missing payment-event implementation.

## Activation and finding feedback

Activation is opt-in through a separately reviewed session/delegation binding.
No credential, account, source registration or production binding was created.
`CF_HELIXA_BINDINGS_JSON` accepts at most 100 entries, each containing
`contentFactoryOrganizationId`, `helixaOrganizationId`, optional `projectId`,
HTTPS `origin`, `sessionCookieVariable` (named
`CF_HELIXA_SESSION_COOKIE_<NAME>`), `approvedOperations`, `approvedBy`, and
`expiresAt`. The real cookie stays in that private environment variable, never
in a database payload, Git or model-visible input. This is a delegated native
session transport, not an automatically configured machine identity. Helixa
still enforces its current actual person/membership/native rights. Expired or
missing configuration returns `not_connected`.

`prepareFindingFeedback` returns the exact accepted active finding JSON bytes
and SHA-256 for existing governed Helixa Content/Artifacts intake. Once actual
receipts are registered, `proposeFinding` verifies their hash and sends a
candidate with the finding's expiry and uncertainty; it does not approve it.
Native Memory review remains required. Missing receipts stay an explicit gate.
Invalidation uses native `memory.declare`, not new deletion authority. The
Helixa-side implementation and focused tests are delivered separately from its
fresh `origin/stage` branch; no repositories or histories are mixed.
