# Publication measurement and outcome learning

`SocialFactoryMeasurementService` collects existing per-post provider counters.
It requires a native published post, matching tenant/channel/provider/external
receipt and the exact publication revision. Missing, unsupported, restricted and
actual zero are separate. Collection records the completion time of the direct
provider read; retrying the same request id returns the original timestamp and
expiry. Current `PostsService.checkPostAnalytics` does not read its Redis cache.
Do not restore a cache on that path without preserving acquisition metadata.

Counters are cumulative lifetime values with publication age. They are not
summed account totals or counts earned in an arbitrary requested period.
Instagram slide progression and Telegram Bot API publication insights are not
advertised. Existing audience analytics separately uses last values for stocks,
sums for daily flows and means for provider averages; duration is not percent.

Observations expire after 30 days. Current access/publication checks run again
before replay, direct reads, learning or planning. Store `sourceRef` and `resourceRef` lineage allows
source removal/expiry to scrub observations and meaning-bearing descendants,
while retaining campaign items and owner-authored data. The common repository
physically clears expired payloads through `purgeExpired`, not just read filters.

YouTube counters are available without derivative permission. A trusted human
administrator can record an actually accepted derived-metrics amendment using
`recordYouTubeAmendment`; the record binds the tenant/channel, installed OAuth
API-client digest, own-channel analysis use case, acceptance reference and
expiry. It grants no public cross-owner benchmarking. Changing the API client,
revoking the grant or expiry disables subsequent derivative use. The controller
must resolve the real actor and administration rights; this method must never
be an unrestricted model tool.

`SocialFactoryLearningService` allocates one-variable experiments before
publication, 3–20 distinct items per variant, and 24/48/72/168-hour comparisons.
Repeated collections are one sample. Platforms, accounts, source routes, units,
windows and formats must agree (format may be the explicit experiment variable).
Small/noisy/incomparable/missing samples yield no winner. Recommendations are
associations, proposed first, temporary and preserve at least 25% exploration.
Identical evidence retains review state and expiry. New evidence requires
review; withdrawn findings do not resurrect. Contrary recomputation withdraws
an old recommendation. Planning must call `forPlanning` and persist finding IDs;
only current accepted findings with revalidated evidence are returned.

## Optional licensed exports

`SocialFactoryOptionalAnalyticsService` has a useful empty baseline and explicit
not-configured, rights, quota and budget states. It calls the shared server source
authority internally with purpose `licensed_registry_export_v1`; client claims
are not grants. Register it using `SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY`.
Configured paid connectors additionally require existing cost/quota admission.
No external vendor is activated by this implementation.

`LicensedAnalyticsExportAdapter` is the zero-cost initial adapter, for existing
licensed exports ingested into the native source registry. It rereads the exact
current source/snapshot and requires the complete JSON to remain an active
allowed evidence excerpt (maximum 8 KiB). The strict JSON shape is:

```json
{"version":1,"provider":"licensed export source","entries":[{"id":"post-1","title":"Example","text":"Source content","url":"https://example.com/post","accountId":"source-account","accountSize":1000,"format":"post","metric":"views","value":0,"observedAt":"2026-11-02T12:00:00Z","publishedAt":"2026-11-01T12:00:00Z","window":{"start":"2026-11-01T12:00:00Z","end":"2026-11-02T12:00:00Z"}}]}
```

An absent measurement is `value:null`. Original dates/window/account size/format
are retained; readings do not extend the original 30-day observation lifecycle.
There are no synthetic ratios or cross-owner scores. Vendor acquisition,
uploads and forwarding preserve original-platform restrictions. Telegram reuse
requires the same scoped consent as other discovery; YouTube comparison data is
refused by this export use case rather than bypassing its restrictions.

Optional analytics returns sourceAssertions (sourceId/sourceRevision/permissionRevision). The caller must reassert these atomically through the common source authority before persisting derived discovery; returning an in-memory document alone is not a revoke-safe save.
