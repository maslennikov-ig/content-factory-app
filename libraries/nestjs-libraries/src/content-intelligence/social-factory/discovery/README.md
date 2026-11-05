# Channel-grounded discovery

`SocialDiscoveryService` consumes the shared `ChannelEditorialProfileV1` and returns
shared `DiscoveryCandidateV1` values. The request's profile revision is the stored
revision, including zero for a new unsaved channel resolved from company defaults.
It separates lexical editorial relevance from raw observed performance;
absent performance stays `unknown`. It never generates a normalized popularity
score, compares different platforms, or treats search rank/popularity prose as
observed performance. A numeric observation needs its real metric, observation
timestamp and window; zero is a legitimate available value.

## Application composition

The application entrypoint is
[`SocialFactoryPlanningService.discover`](../planning.service.ts), registered by
[`SocialFactoryModule`](../social-factory.module.ts) and exposed through
`channel.discover` and campaign planning. It resolves the actual company/channel
profile, current source permissions and accepted learning findings on the server.
`allowWebSearch` defaults to false. Sources/RSS and paid analytics are optional;
the brief supplies proposed planning angles when external evidence is unavailable.

Planning uses `EditorialSourceAuthorityV1` to reread permitted source snapshots,
retains their source/configuration/permission admissions and reasserts those
admissions in the transaction that saves discovery. Licensed registry exports
require their separate purpose permission and add attributable evidence through
the configured zero-cost adapter. The optional connector does not activate a
vendor subscription. Redis supplies context caching and invalidation fencing;
it does not replace the authoritative source read or durable admission check.

`discover(input: DiscoveryRequest): Promise<DiscoveryResult>` accepts
`organizationId`, `profileRevision`, the shared `profile`, registered `sources`,
optional `allowWebSearch`, optional `sourceRecommendationAcknowledged`, and
optional shared `findings`. Resolve the organization, profile, source grants and
findings on the server. Chat/model arguments are not authority to grant reuse or
claim rights. No new schema, provider registry, credentials or network transport
is introduced by this module. A owns backend/module/tool registration.

Each registered source requires a `DiscoverySourceGrant`, including an actual
rights evidence ID, revision, discovery purpose, origin, acquisition method,
source/chat context, organization and channel scope, revocation and expiry.
Existing generic `rightsState=CONFIRMED` is necessary but is not a replacement
for purpose-specific AI permission. For old uploads lacking origin/provenance,
collect the missing declaration instead of assigning a permissive origin.

The lower-level `RegistryDiscoveryReader` reads `ContentSourceRegistryRepository.getDraftMaterial`
to reuse its organization, active, confirmed-rights, snapshot and purge checks.
It does not rescrape URLs/RSS, import a Telegram archive, activate sources, or
schedule subscription work. Uploads and first-party text use existing manual
source snapshots; URL/RSS sources use their existing fresh registry snapshots.
Expired non-manual snapshots are unavailable until the existing sync path
refreshes them. Every returned evidence has a canonical `sourceId` separate
from its immutable evidence ID and snapshot revision.

`TopicDiscoveryReader` calls `LeadTopicGateway.check(organizationId, query)`:
existing operator flags, account routing, budget/egress controls and research
cache continue to apply. The required server-side
`resolvePublicReuseRights(organizationId, url)` resolves canonical `sourceId`,
rights evidence, original platform, access route and expiration from configured
licenses/policy. Search access alone is not a reuse license. Missing or unknown
reuse rights never become candidate evidence. Known Telegram/YouTube URLs cannot
be relabeled `web` by the resolver. In particular, public search does not bypass
platform-specific permission by using an upload, forwarded copy or vendor.
When web search returns entries without permitted reuse, `gaps` includes one
`WEB_SEARCH_REUSE_PERMISSION_REQUIRED` code without their URLs or content;
the partial result is not cached and permission is never inferred from search.

Without sources or enabled research, discovery still provides editorial proposal
prompts from the channel brief. It does not invent customer results or history.
`PersistentSourceRecommendation` records one optional connection invitation per
organization/channel in shared kind `source_recommendation`, including when the
caller already acknowledged it. Cache hits cannot repeat the invitation.
The atomic presentation claim happens immediately before a successful return,
after all source/cache operations. A lost chat/network response after return
can still consume that presentation; guaranteed delivery requires a chat-level
acknowledgement/outbox rather than treating an API return as user receipt.

## Retention and invalidation

`RedisDiscoveryCache` uses the existing Redis client, with hashed tenant/context
keys in one cluster slot, bounded six-hour TTL, and atomic Lua read/write/purge.
The cache key includes the actual profile, revision, grant revisions/scopes and
active findings. Live registered material is reread before cache reuse, including
snapshot additions, deletions and changes. Cached values contain selected
candidate evidence and a snapshot digest, never the source document corpus.

On source deletion, archive, rights revocation, connection consent revocation or
grant deletion, the application must change the durable source/grant state and then call
`await discovery.invalidateOrganization(organizationId)` **before acknowledging
the operation**, alongside the shared repository's
`invalidateBySource(organizationId, canonicalSourceId)` for persisted downstream
records. Discovery deliberately purges all tenant research, including other
channels; this simple conservative policy does not affect another tenant.
The generation counter prevents an in-flight run from recreating purged values
and makes that run stop with `DISCOVERY_INVALIDATED_DURING_RUN`, including
partially failed source/search runs. This method is idempotent in effect.

Candidate expiry is the earliest applicable grant, consent, evidence, source or
six-hour retention boundary. Expired, revoked, wrong-purpose and cross-tenant
evidence is omitted. Partial provider failures are returned as safe gap codes and
are not cached. Errors never expose provider URLs, tokens or raw exception text.
Physical Redis expiry implements cache retention; a missing Redis connection is
an explicit service failure, not permission to create an unbounded local cache.

Freshness and storage rights have different effects. An expired HTTP snapshot,
`source.freshUntil`, discovery cache, profile snapshot or planning finding is stale
input for new planning. Refresh or reread it before admitting new work; its age
alone does not erase prepared/published native materials. `purgeExpired` clears
expired planning payloads and prevents their expiry cascade from deleting that
history. Explicit withdrawal/revocation and actual permission or snapshot retention
deadlines retain the source-lifecycle redaction rules, including native derivatives
where required. See the [shared lifecycle contract](../contracts/README.md#source-lifecycle).

## Learning integration

The campaign/profile assembly owner calls `learning.forPlanning(orgId, channelId,
now)` and passes its approved shared findings as `request.findings`. Discovery
accepts only unexpired `accepted` findings covering the channel with observation
and source references. Finding statements influence generated queries and the
next planning prompts; uncertainty is retained and `result.findingIds` records
what the later campaign consumed. Withdrawal/expiry changes the context key;
call invalidation too when removing source-dependent findings. Statistical
admission, exploration allocation and observed-versus-causal interpretation stay
with the learning owner; this module does not reclassify an association as fact.

## Policy evidence and focused verification

Reviewed on 2026-11-03: [Telegram content licensing](https://telegram.org/tos/content-licensing)
requires context-specific continued consent from relevant users for the described
AI use. This module checks a server-resolved attestation and referenced evidence;
it does not manufacture that consent. [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
and [derived-metric policy](https://developers.google.com/youtube/terms/derived-metrics-policy)
distinguish authorized/public data and derived-metric acceptance. Public YouTube
search results are therefore excluded from this generic lane; an explicitly
authorized registry source retains scope and expiry. No cross-owner analytics
normalization or extended API-data retention is inferred here.

Run `pnpm exec jest tests/social-factory-discovery.test.cjs --runInBand --no-coverage`.
The optional real-Redis tests use an explicit isolated
`CF_DISCOVERY_TEST_REDIS_URL` and unique tenant IDs; they never `FLUSHDB` or read
application secrets. Run the same Jest command with
`tests/social-factory-discovery-redis.test.cjs` included and the variable set.
Provider/account and end-to-end chat integration are separate acceptance work.
