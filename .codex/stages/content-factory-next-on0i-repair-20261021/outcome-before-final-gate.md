# Native Mastra repair — local outcome

Status: implementation and root acceptance in progress. This document does not
supersede the pending final receipt until its checks and remaining browser cases
are recorded. Baseline `e74e059ea104593d2fac831eb989714a5b151263`, branch
`codex/on0i-native-repair-20261021`.

## Delivered behavior under verification

- Actual web messages, questions, approvals, signals and observer reconnect use
  the native Session, AgentController and shared DurableAgent registry.
- The native retry processor owns transient attempts and the ordered configured
  fallback chain. Provider/SDK retry multiplication is removed. Authentication,
  consent, quota, explicit Stop and uncertain irreversible writes remain real
  boundaries. Implicit step/time/repeated-result caps are removed from native
  turns; explicit operator settings are respected. Actual resolved native
  Session options retain Mastra's own 1000-step fuse; the product's legacy
  Agent default of64 does not override it.
- Official Redis cache/pubsub and native PostgreSQL workflows persist replay,
  queued input, availability cooldown and accepted continuation identities.
  Native recovery and fencing own execution; adapters retain trusted identity,
  current permissions, original work context, accounting and monotonic Stop.
- Native Memory receipts preserve possibly executed domain operations across
  lost acknowledgements and process death. Unknown outcomes require a person;
  they are not silently repeated or relabelled successful.
- Official native Observability and MastraStorageExporter now produce redacted,
  scoped spans in the existing local PostgreSQL. Supported public listTraces and
  getTrace APIs replace calls to unsupported advanced metrics. The billing
  ledger remains the cost authority; span coverage is reported explicitly.
- Chat navigation follows the existing sidebar pattern, including the assistant
  disclosure, right-hand New button, pagination and rename/delete. The transcript
  has no archive panel above it. History and unsent drafts survive navigation.

## Evidence

`acceptance-map.md` maps A1–A31 to actual exercised behavior. Deterministic native
SDK/storage probes and real providers are labelled separately. The root semantic
review read the original requests, actual answers, saved artifacts and receipts
for rewrite, reference, current research, research reuse, private-fact question,
delegated answer, unsupported-source premise and configured fallback.

Real local providers: OpenRouter `openai/gpt-6-luna`, configured fallback
`z-ai/glm-5.3`, and Exa search. The fallback test injects the primary 429 and then
uses one genuine GLM response. It does not claim a natural provider outage,
comparative model quality or cheaper auxiliary routing. Current main and
classifier settings select the same model. No Tavily provider request is claimed.

The synthetic stand runs actual authenticated Nest routes, Prisma, native
Mastra/PostgreSQL and Redis, plus the actual frontend. It omits outbound social,
mail and unrelated Temporal workers. Browser screenshots and readbacks are
described in `browser-local.md`; real provider receipts are in
`real-local-qa-completion.json`.

## Local configuration and boundaries

The owner's explicit server-read instruction was fulfilled for existing
generation/search credentials only. Private persistent configuration is at
`/home/me/.config/content-factory/local-ai.json` (0600, parent0700); local settings
are re-encrypted under the existing local secret. No server JWT or complete
server environment was copied. Secrets and production account identifiers stay
outside Git. The isolated stand's private runtime files are separate from the
repository.

No push, image publication, production deployment, production schema change,
social publishing, account connection or real-user messaging is part of this
repair. Historical production receipts establish none of its local acceptance.

## Honest limits

Native retries cannot guarantee provider availability. Exhausted eligible chains
wait durably when retryable; permanent blockers and uncertain writes stay
actionable. A killed provider request can leave an unknown-cost row, and cold
recovery can open a new admission. The retained unknown row is not manually
rewritten to zero. Cache/event replay retention is finite (up to24 hours), and
native untilIdle cleanup can remove a completed run's cache immediately. An
empty stream alone never proves completion; saved native history is required.

Gate4 passed all three typechecks and the complete build, then intentionally stopped before the suite because the real compiled Stop left the composer locked. The current native Stop settlement and late-history correction pass focused checks and await a fresh compiled run. A second natural PostgreSQL research scenario also failed: retained sources falsely ended at the preview. Generic full-source reads and exact revision-bound passage reuse are under repair. Native exporter shutdown, current scoped observability HTTP and independent review pass. The final source-stable three-part suite, compiled Stop/follow-up and useful current research artifact remain pending. Historical failed controls stay preserved.


Latest source follow-up: Gate5 native Stop confirmed terminal metadata before the saved native message tail; original-reader FINISH/EOF drain and exact saved-response proof are under final review. The fullsource PostgreSQL real case finished execution but saved no CORE, so it remains semantic FAIL. Model-visible safe-input recovery and unified exact-passage selection are frozen (259 focused tests/types PASS); new real acceptance is pending.
