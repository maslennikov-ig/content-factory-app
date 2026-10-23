# Content Factory video access specification

Revision 1, 23 October 2026. Owner-requested implementation specification;
local implementation and provider gates are recorded in the
[acceptance runbook](../../operations/video-subscription-local-acceptance.md).

**Outcome:** a person can create a video from a saved Content Factory draft using their eligible provider subscription, the existing API route, or a provider website followed by file upload. The same piece, edited script, selected language and owned result remain available in Content Factory.

**Scope:** addendum to video epic `content-factory-next-zlq6` / HONEY-5940 and [API plan revision 3](../plans/2026-10-22-video-generation.md). That plan and tasks `.1`–`.7` retain their identities and accepted API behavior. New implementation tasks are `.8`–`.12`; real account, billing and quality evidence stays in `.7`. The [implementation plan](../plans/2026-10-23-video-subscription-access.md) maps acceptance to those tasks. Beads/Linear owns status; these documents define contracts.

## 1. Product behavior

The existing video workspace gains an explicit access choice, separate from provider/model selection:

| Choice | User-visible behavior | Charge unit |
| --- | --- | --- |
| «Использовать мою подписку» | Sign in on the provider's page; choose account-available settings; approve the saved script and a credit estimate; track and save the result | Provider-specific subscription credits |
| «Использовать API» | Use the current configured workspace/service API payer and its existing USD policy | USD |
| «Создать у провайдера и загрузить файл» | Copy/download the prepared text and options, open the provider website, then upload or select the finished video | External expense unknown to Content Factory |

Show subscription first as an option; never connect or select a paid route automatically. First visit requires an explicit route choice. Remember the person's last choice within the workspace, but revalidate before every launch. Existing API drafts/jobs reopen as API. Changing a route preserves draft text and compatible settings, flags incompatible options, invalidates approval, and requires a new preflight. Never silently replace the provider, model, engine, account or payer.

Subscription access does not fund text-model preparation: «Подготовить с ИИ» continues to use the existing text settings/allowance and must state this. Manual editing/copying does not require a model call. Output locale remains independent of interface locale.

These are Content Factory features and terminology. Use Content Factory branding in new product copy, implementation documents and tasks. Preserve existing license/attribution files and compatible internal identifiers.

## 2. Provider evidence and limits

Official materials were checked on 23 October 2026. They justify an implementation route, not a claim of successful account access or quality:

| Provider | Fixed resource | Supported direction | Restriction to preserve |
| --- | --- | --- | --- |
| Higgsfield | `https://mcp.higgsfield.ai/mcp` | User OAuth, Streamable HTTP MCP, subscription credits | Requires an eligible paid plan. Web Unlimited/free generation allowances do not transfer to MCP |
| HeyGen | `https://mcp.heygen.com/mcp/v1/` | User OAuth MCP, plan credits, exact-script avatar video | Current developer guidance positions OAuth for small trials; regular/batch/production use is not established |

Higgsfield documents third-party MCP OAuth clients and price-only requests using `get_cost: true`, with status through `jobs_wait`. Actual model tool names/arguments must come from a verified schema; do not copy REST request shapes into MCP. [Connection example](https://higgsfield.ai/blog/automate-ai-video-n8n-make), [subscription requirements](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent), [Unlimited scope](https://higgsfield.ai/creator-hub/help-center/credits/what-are-unlimited-models-and-which-plans-include-them).

HeyGen documents `create_video` for an avatar speaking our script and `get_video` for status. Engine selection must be explicit; the documented default is Avatar IV. `create_video_agent` is not an interchangeable route. The 5–15 second `create_model_video` limit is for a different generative product, not a blanket avatar-video limit. Preserve the small-trial qualification and handle `api_key_required` as an unavailable subscription route. [MCP tools](https://developers.heygen.com/mcp/overview), [OAuth scale guidance](https://developers.heygen.com/llms.txt), [error codes](https://developers.heygen.com/docs/error-codes#api-key-required).

Initial target settings remain the existing clip/presenter choices. Offer their subscription equivalents only after exact capability matching; an absent Wan/Kling variant or Avatar III option is visibly unavailable, not remapped to a similar name. Do not extend scope into all models, video agents, editing, voice cloning or avatar creation.

Public discovery advertised issuer `https://clerk.higgsfield.ai` for Higgsfield and `https://api2.heygen.com` for HeyGen, with S256 and client registration. These values seed reviewed allowlists, not unconditional trust in future metadata. Registration, account eligibility, credit quotes, job schemas and idempotency remain real-provider gates. [Public discovery evidence](../../../.codex/stages/content-factory-next-zlq6-implementation-20261022/subscription-research/oauth-discovery.public.json).

## 3. Ownership, consent and privacy

- A subscription account belongs to the connecting Content Factory user. Only that user may approve spending its credits, cancel its remote jobs or change its credit limits. An administrator can enable/disable subscription use in their workspace but cannot use another member's account.
- Reuse current editor/create permissions for connection and launch; read-only members cannot connect or spend. Check current membership and role at callback, preflight, launch and each credential-using recovery step, not only at first login.
- Connect each provider account once per owner, with explicit workspace grants. A second workspace grant requires the owner's action. The account's aggregate credit admission spans all its granted workspaces; do not duplicate its apparent budget per workspace.
- Identify a provider wallet with a verified issuer + stable account/subject identity. Store a keyed identity digest for deduplication; do not use email as identity or a client-supplied account ID. Reject linking the same provider wallet to a different Content Factory owner without exposing who owns it. Account transfer/shared subscriptions are outside this release. If stable wallet identity cannot be verified, generation stays unavailable.
- Drafts and result media retain existing workspace visibility. Nonowners see «Личная подписка автора» and permitted job/result state, never private profile, balance, OAuth state or tokens. Owner labels must not reveal account emails to colleagues or the model.
- Disconnect means disabling all grants for this personal provider connection, stopping new credential use, clearing local tokens and attempting provider revocation if supported. Explain its all-workspace scope before confirmation. Workspace disable affects that workspace only. Neither action deletes saved media or guarantees cancellation/refund of already submitted jobs.
- Removing membership stops use in that workspace; deleting the Content Factory owner disables all their grants/tokens while retaining minimal job/spend audit and organization-owned results. Use the existing account-deletion path; no orphaned usable token.

## 4. OAuth and outbound MCP boundary

Implement a dedicated outbound client. Existing inbound Content Factory MCP remains independent. Reuse the installed `@modelcontextprotocol/sdk` (`1.31.0` at the inspected baseline), its client/auth facilities and the application's encryption/session patterns. Verify installed signatures before implementation; do not create a general arbitrary-server connector or install a provider CLI/skill at runtime.

The browser starts a connection with an authenticated, CSRF-protected POST. The backend stores a one-use, 10-minute attempt bound to actor, workspace, provider, issuer, redirect URI and return location. Use random state, PKCE S256 and server-side verifier storage. Callback requires matching state and actor/session, exact return-origin policy and current workspace permission; expired/reused/cross-user/cross-workspace attempts fail before token acceptance. Error callbacks consume the attempt too. Missing session requires a new connection attempt.

Discover protected-resource and authorization-server metadata through a fixed per-provider HTTPS allowlist. Validate issuer/resource consistency and S256; send the intended MCP resource in authorization and token requests. Dynamic client registration is supported when advertised; persist registration per issuer/client configuration with concurrency protection. A provider refusal yields `VIDEO_CONNECTION_UNAVAILABLE`, not a security downgrade. Preconfigured registration is an optional operator-controlled alternative only when genuinely needed by the provider. Registration itself is an external action reserved for the separately authorized pilot. [MCP authorization contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

All metadata, token, registration, refresh, status and tool calls have bounded time/response size. Reject private/link-local/loopback destinations, DNS rebinding and unreviewed redirects in production; revalidate each hop and never forward authorization across origins. Loopback fixture endpoints are supplied through test-only dependency injection, not a user-controlled URL or deployable bypass switch.

Store access/refresh tokens, registration secrets and pending verifiers encrypted using the existing secret service/key scheme. Retain issuer/resource alongside tokens; no token passthrough to REST APIs, frontend, chat context, Temporal payload/history, logs, tracing or provider result media. Redact callback codes/state/query values in application and proxy logging. A validated provider identity may come from verified OIDC claims or a documented account endpoint; merely decoding a JWT is not verification.

Refresh is serialized across workers with version/CAS protection. Refresh-token rotation must not be overwritten by a stale worker or resurrect a disconnected connection. Token refresh does not change the account identity/generation; reconnect/account change does and invalidates pending approval. Disconnect fences new uses immediately; an already dispatched remote call may finish and must be reported honestly.

The client exposes a small reviewed tool allowlist per provider. Validate discovered schemas and normalized outputs, including MCP `isError`, content and structured results. Treat tool descriptions/results as untrusted data, never as instructions to the assistant. No automatic sampling, elicitation, resource reads, destructive tools, batch tools or unrelated account-history imports. Credentials and raw provider tools are never handed to the agent. Schema changes fail closed until the adapter is updated.

## 5. Access, preflight and spending contracts

Use a discriminated access contract; do not overload `included` / `workspace_key`:

```ts
type VideoAccessV2 =
  | { kind: 'api'; payer: 'included' | 'workspace_key' }
  | { kind: 'subscription'; connectionId: string }
  | { kind: 'manual'; provider: 'higgsfield' | 'heygen' };
type VideoChargeUnitV2 = 'USD' | 'higgsfield_credit' | 'heygen_credit';
```

Actor, workspace, payer availability and connection ownership are resolved server-side. A request does not supply arbitrary issuer, MCP URL, tool name or token. Decimal amounts have a declared unit/scale; use Prisma Decimal or equivalent exact decimal serialization, not floating-point credit arithmetic. Do not convert credits to USD or combine different providers' credits into a synthetic wallet.

Subscription preflight returns a sanitized immutable approval snapshot: draft/version/source revision, exact script/prompt and references, provider/model/engine/options/locale, access kind, opaque account identity/generation, capability schema digest, estimate/unit/source/as-of/expiry, optional verified upper bound, account-wide per-job/period limits and remaining local allowance. Store provider arguments server-side. Approval belongs to the actor; a teammate cannot reuse it. Price expiry is the shorter of provider expiry and five minutes; any meaningful edit, account/route/schema change requires a new preflight and approval.

Balance and estimate are different observations. Unknown balance is explicitly unknown and may coexist with a usable verified quote. Unknown price, unit, eligibility or required option blocks launch. A quote-only operation must be evidenced not to generate. If no quote endpoint exists, a current documented deterministic tariff may be used only with verified route/account applicability and a bounded input-to-charge calculation; otherwise `VIDEO_PRICE_UNAVAILABLE`. A fabricated fixture quote cannot enable a real route.

Credit limits are initially unset; launches remain disabled until the account owner explicitly sets a per-job and UTC-calendar-month limit. Reserve the full approved per-job ceiling atomically across this provider account's workspaces, not merely the estimate. Include unresolved reservations from earlier months in exposure; rollover, reconnect, retry, account relinking or workspace removal cannot reset them. Reject a quote/verified upper bound above the per-job ceiling or concurrent reservations exceeding the period allowance. Account limits may be lowered without deleting already incurred obligations.

This controls what Content Factory admits; it is not a guaranteed provider billing cap. Show that distinction before approval whenever the provider offers no enforced bound. External website spending can change the balance independently. After completion record actual cost only from attributable provider evidence. A balance delta with unrelated activity is not a job invoice. Keep unknown spend/reservations visible; only verified per-job spend or an explicitly documented owner reconciliation may settle them. Store reconciliation actor/evidence and never display it as provider-confirmed. Failure/cancel/save failure alone does not mean zero charge or refund.

There is no automatic fallback from credits to API, from one account to another, or from one engine to another. A deliberate switch starts a new reviewed request and does not erase an uncertain old one.

## 6. Durable execution and compatibility

Keep API V1 rows, API payer enum and existing Temporal workflow/activity contracts valid. Add subscription persistence with credit fields and an explicitly versioned workflow, proposed `videoSubscriptionWorkflowV1` / `videoSubscriptionActivityV1`. Never put subscription jobs into USD columns as zero or extend the API recovery scan so it can consume subscription work.

Minimum durable entities/constraints (the executor may combine tables without weakening them):

| Entity | Required data/invariant |
| --- | --- |
| Provider connection and workspace grant | Owner/provider/verified wallet digest, encrypted token set, issuer/resource, generation, grant state, refresh lease/version; unique wallet binding |
| OAuth attempt / client registration | One-use state hash, encrypted verifier, expiry/bindings; issuer-bound registration with secret protection |
| Credit policy and obligations | Account scope, unit, period, per-job/period ceilings; unique job reservation, exact amounts and reconciliation provenance |
| Subscription preflight | Actor/workspace/draft version/digest, immutable request/quote/capability/account-generation snapshot, expiry and consumed identity |
| Subscription job | Tenant/actor/access identity, one intent/preflight, immutable request, before-send marker, provider receipt, lease/CAS, state, cost certainty, owned media |
| Route intent receipt | Unique workspace + client intent; binds access kind and approval digest for new multi-route callers; route changes with the same intent fail |
| Manual attachment | Tenant/piece/draft revision, existing owned Media ID, manual provenance; idempotent attachment, no generated-job or spend claim |

Additive Prisma migration only; no production schema application in this work. New UI/chat doors use a shared facade. API selections delegate to current API services with the same stable intent after the route receipt is persisted; a crash between steps resumes the same intent. Existing API doors remain API-only and backward compatible. New subscription jobs use a distinct internal identity/dispatch path. Unified reads return an access discriminant so UI never guesses the currency or dispatcher from the provider name.

Before the first potentially billable MCP call, durably record submission intent and pin all arguments. A successful response persists provider job ID/receipt before polling. Receipt recovery, status polling and file retries do not generate. A transport timeout, malformed response after send, `isError` with uncertain acceptance, worker crash at the send boundary or lost response becomes `submission_unknown`; no new key/job/send on refresh or reconnect. MCP request ID is not assumed to be an idempotency key. Same-request resubmission is allowed only if this exact provider tool's deduplication is documented and proven; REST evidence does not establish MCP behavior. Default is zero automatic submit retry, including hidden SDK/auth retry.

Read-only status/download retries are bounded separately. Long-running `jobs_wait` must use bounded timeout and persisted job identity, not block one worker indefinitely. Resume after worker/service restart using the persisted receipt. Refresh failure or revoked membership pauses credential use with a clear `reauth_required`/access-unavailable state, never a different payer. Reconnecting the same verified wallet can explicitly resume status reads for an existing job; a different wallet cannot inherit it.

Remote cancel exists only if the exact tool supports it and the owner requested it. Local stop/timeout/disconnect is not confirmed remote cancellation. Keep uncertain and delayed jobs recoverable with truthful reservations. Import completed results through existing bounded media validation/storage; final lease/CAS and one Media per job prevent duplicates. Retry saving the same URL/receipt without another generation. A captured accessible result can still be saved after disconnect without using a revoked credential. Already saved files remain playable/downloadable after provider URL expiry.

## 7. Shared backend, UI and chat interfaces

Use existing DTO -> Controller -> Service -> Repository boundaries. Proposed additive routes below are relative to the existing backend base; names become binding once implemented:

| Route | Contract |
| --- | --- |
| `GET /media/video-access` | Current actor's choices, eligibility, safe connection view and limits; never query arbitrary account history |
| `POST /media/video-connections/:provider/start` | Authenticated connection attempt; returns provider authorization URL, no generation |
| `GET /media/video-connections/:provider/callback` | OAuth code/error handling bound to the stored attempt/session; redirects to an allowlisted Content Factory route |
| `DELETE /media/video-connections/:id` | Owner disconnect; no remote asset deletion or implicit refund |
| `PUT /media/video-connections/:id/limits` | Owner sets credit policy; administrator workspace enablement uses existing admin settings boundary |
| `POST /media/video-v2/preflight` | `{draftId, version, access}` -> actor-bound approval snapshot |
| `GET /media/video-v2/preflights/:id` | Same saved snapshot for approval UI/chat with permission and freshness checks |
| `POST /media/video-v2/jobs` | `{preflightId, intentId}` -> one API or subscription job; no model-generated tool arguments accepted |
| `GET /media/video-v2/jobs[/:id]` | Unified permitted job/history/result, access kind, amount/unit/knownness |
| `POST /media/video-v2/jobs/:id/{cancel,retry-save}` | Same domain permissions/receipts; explicit actions, no new generation |
| `GET /media/video-v2/jobs/:id/download` | Owned authorized result download |
| `POST /media/video-v2/manual-attachments` | `{draftId, version, mediaId}` -> owned result link; no remote fetch from an arbitrary URL |

Reuse the existing upload pipeline/Media picker. Validate ownership, current draft/version, actual video type and limits server-side, not just filename extension. Failed/duplicate uploads or attachment requests must not claim a new generation. Keep uploaded provenance and external cost unknown. Do not infer provider quality, engine or exact-script compliance from an uploaded file. Opening a provider website sends no draft/account data in URL query parameters; copy/export is explicit.

Extend `VideoWorkspace`, `VideoProviderSettings`, Media/piece entry and chat approval cards. Keep API administrator settings separate from «Мои подписки». Preserve current navigation/back/forward behavior, tenant-and-user cache keys, saved drafts and unsaved-edit conflict handling. All existing interface locales receive meaningful copy, with accessible keyboard/focus/error/loading/empty states and current design tokens.

Chat uses the same facade, catalog and saved approval snapshot. Add versioned capability IDs where signatures change; preserve old saved chat approvals as API-only. Approval shows exact text/settings/access/charge unit and is disabled until loaded and current. Source text or model output cannot change access policy, authorize login, choose arbitrary tools or supply a connection owned by another user. Connection itself is a person-driven UI action; the assistant may open its screen but cannot log in or auto-consent. Manual route yields an actionable preparation/upload card, never «генерируем» while the person is working on another site.

Required states include disconnected, connecting, refused/expired login, unsupported subscription/tool/option, insufficient credits, unknown price, approval stale, queued/running, submission unknown, reconnect required, saving/save failed, completed and manual awaiting upload. Use sanitized actionable error codes; never render raw provider responses or suggest that a failed subscription silently used API.

## 8. Acceptance examples and ownership

| ID | Observable acceptance | Task |
| --- | --- | --- |
| A1 | Two users and two workspaces cannot reuse each other's OAuth attempt, approval, token or personal spend permission; member removal/disconnect blocks further token use | `.8`, `.9` |
| A2 | Concurrent token refresh retains the newest token; disconnect during refresh stays disconnected; issuer/redirect/private-host attacks fail before credential transmission | `.8` |
| A3 | Same provider wallet in two granted workspaces cannot spend the same remaining allowance twice; Decimal units and old unresolved reservations survive month rollover/reconnect | `.9` |
| A4 | API -> subscription -> manual switch preserves edited text, requires correct new approval, makes no submit on selection, and never silently falls back | `.9`, `.12` |
| A5 | Higgsfield fixture implements quote-only, allowed tool selection, one submitted job, bounded status and owned output; unavailable variants and Unlimited assumptions are refused | `.10` |
| A6 | HeyGen fixture receives the exact approved script and explicit engine; trial restrictions and `api_key_required` stop cleanly; no Video Agent substitution | `.11` |
| A7 | Double-click/chat replay/worker restart create at most one logical submit; a lost response remains uncertain and no retry generates again; retry-save imports the same result | `.9`–`.12` |
| A8 | Real local browser follows connection fixture -> draft/edit -> credit approval -> status -> reload/play/download for both providers; shared chat launches the same service | `.12` |
| A9 | Manual copy/open/upload/reopen/download works without provider login or generation; a foreign/nonvideo file cannot attach; duplicate attach stays one result | `.12` |
| A10 | Existing API UI/chat and old V1 jobs still work; inbound MCP, old Temporal histories, USD accounting and license files remain compatible | `.8`–`.12` |
| A11 | Real OAuth registration/access, tool schemas, account identity, exact quotes, receipts, spend, playable output and language/quality are observed and documented honestly | `.7`, separate authority |

Local acceptance uses actual HTTP OAuth/MCP fixtures, backend permissions, Prisma, frontend, storage and an isolated Temporal worker. Stub external identities/providers/text only; in-memory service mocks alone are insufficient for A1/A3/A7/A8. Fixtures establish engineering behavior, never actual provider compatibility or quality.

## 9. Rollout, gates and exclusions

Keep new subscription launches disabled by default outside owned test fixtures until account/client and cost gates pass. Enablement is per provider/workspace; HeyGen stays a bounded pilot until regular usage is established. Kill switches stop new launches while preserving status/save recovery where credentials and membership remain valid. Disconnect is a different operation and immediately removes credential access. Rollback disables new doors/launches and retains additive records, reservations, accepted jobs and media; no destructive down-migration or replay.

No timeline/editor/render pipeline, new wallet, subscription resale, shared account pooling, browser-cookie/password automation, web Unlimited bypass, social publishing, new retail tariff or automatic account purchase. Deployment/production migrations and policy changes are separate from local acceptance.

Current work authorizes the planning packet and Beads tasks. The future implementation handoff permits local engineering when invoked. Real client registration, OAuth login/token storage, API key wiring, paid text/video calls and consumption of existing subscription credits require explicit current owner authority. The earlier API $10 funding / $25 pilot is not a subscription budget or authorization.

`.7` must first obtain separately authorized read-only account/capability/quote evidence. Then propose an exact account/tool/settings/attempt count/credit ceiling for a separately approved sample. If price, wallet identity or HeyGen eligibility is unavailable, keep that route disabled and document the blocked gate while finishing all independent engineering and manual/API work. Do not close the epic from fixture results.
