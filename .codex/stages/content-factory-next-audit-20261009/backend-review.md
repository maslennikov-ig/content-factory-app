# Backend source audit — 2026-10-09

Reviewed source: `/home/me/code/content-factory-next`, HEAD `5189430f175382d246629a461d62836c8811b241`. Audit only: no source, Beads, credentials, runtime, or account changes. Root owns integration, issue creation, and final acceptance. The findings below are source conclusions, not claims of exploitation or production acceptance.

## Findings, ordered by priority

### BACKEND-01 — P1 / high: a USER can retrieve the organization's API key and bypass write permissions

**Confirmed defect; must-fix; high confidence.** This is a reachable disclosure of an administrator credential, not merely an unusually broad internal Prisma return type.

Exact chain:

1. `apps/backend/src/api/api.module.ts:179` applies `AuthMiddleware` to authenticated controllers, including `UsersController`. `apps/backend/src/services/auth/auth.middleware.ts:35` accepts the signed session; `:44` verifies the signature; `:51` reloads the user; `:57` requires activation. `:93` loads their organizations and removes disabled memberships. `:114` selects the workspace. Nothing here requires ADMIN or EDITOR. `:117` even creates a missing organization API key.
2. `GET /user/organizations` at `apps/backend/src/api/routes/users.controller.ts:535` has no role policy. It returns `getOrgsByUserId` results after removing disabled memberships. `libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts:247` selects matching memberships with their `role` and `disabled`, but uses Prisma `include`, not a scalar output allowlist. Consequently it also returns the scalar `Organization.apiKey` declared in `libraries/nestjs-libraries/src/database/prisma/schema.prisma:15`. An active USER receives the key. The explicit ADMIN-only `publicApi` projection at `users.controller.ts:112` does not protect this second response.
3. The caller supplies that key as the exact `Authorization` header to `/public/v1`. `apps/backend/src/services/auth/public.auth.middleware.ts:55` resolves it; `:68` checks only whether some associated user is activated, not the caller's role or current membership. `organization.repository.ts:124` does not load membership `disabled` or role. Where Stripe is configured, a subscription must also exist (`public.auth.middleware.ts:75`).
4. `POST /public/v1/posts` at `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:199` checks only `POSTS_PER_MONTH` and reaches `PostsService.createPost` at `:279`. It does not require EDITOR. `DELETE /public/v1/posts/:id` at `:284` and `DELETE /public/v1/posts/group/:group` at `:293` have no role policy and reach tenant-scoped deletion at `:290` / `:298`. `permissions.guard.ts:67` allows a handler without policies; the post-count policy at `permissions.service.ts:95` is distinct from the ADMIN/EDITOR policies at `:33`. Ordinary private post creation explicitly requires EDITOR (`apps/backend/src/api/routes/posts.controller.ts:246`).

**Impact:** a read-only member can create drafts or delete workspace posts using an exposed organization credential. Once copied, it also survives that member's removal/disablement while a qualifying activated account and any required subscription remain. This requires a legitimate USER membership first; it is not unauthenticated key discovery.

**Smallest safe change / acceptance:** project the public organization-list response onto navigation fields; never return `apiKey` or other administrative scalars there. Preserve the internal repository result used by middleware. Verify USER and EDITOR responses contain no key, ADMIN's explicit key-management door still works, and the leaked-key acquisition chain is closed. Any rotation of existing live keys is a separately authorized operational step.

**Value / tradeoff:** closes a direct role bypass with a narrow response change; clients consuming undocumented administrative organization fields will need adjustment. Current API-key authentication constructs a nested `users: [{ users: { role: 'ADMIN' } }]` at `public.auth.middleware.ts:88`, whereas the guard reads `users[0].role`; correcting that shape alone does not close the demonstrated POST/DELETE chain.

### BACKEND-02 — P1 / high: a password-reset JWT is also an indefinitely usable session credential

**Confirmed defect; must-fix; high confidence.**

**Evidence and trigger:** `POST /auth/forgot` reaches `apps/backend/src/services/auth/auth.service.ts:628`. For an account with a local sign-in method, `:638` signs `{ id, expires: <20 minutes later> }`. `libraries/helpers/src/auth/auth.service.ts:62` calls `jsonwebtoken.sign` without JWT `exp`, issuer/audience, or a token-purpose claim. `:65` verifies only the ordinary JWT contract. `AuthMiddleware` at `apps/backend/src/services/auth/auth.middleware.ts:44` accepts that same signature and user ID for every authenticated API; `:51` reloads an activated user and `:93` requires active workspace membership, but never checks reset purpose or the custom `expires` field.

**Impact:** someone holding a password-reset link can use its token in the `auth` header/cookie for full session access, including after the intended 20-minute window. `forgotReturn` does check custom expiry at `auth.service.ts:663`, but that only protects the password-reset endpoint. Completing a reset changes only the password (`libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts:1364`); it neither consumes the reset token nor invalidates this alternate session path. Account blocking and removing all memberships still stop access through the database gates. This does not let someone invent or obtain another user's signed token.

**Smallest safe change / acceptance:** separate reset credentials from sessions with a required purpose and standard expiration, and make the session verifier reject every non-session token. Reset verification must reject session/invitation/activation tokens and consume a reset nonce or equivalent one-time state. Define a safe migration for existing session cookies. With a synthetic secret, prove a fresh reset token cannot authenticate to the regular API, an expired/reset-consumed token is refused everywhere, and a valid session plus a single legitimate reset still work.

**Value / tradeoff:** removes indefinite account access through old email links; requires an explicit compatibility decision for legacy untyped session tokens rather than accepting all historical JWTs forever. Pure local diagnostic below confirms the signature/expiry premise.

### BACKEND-03 — P1 / high: legacy `pos_` OAuth tokens ignore current membership and role

**Confirmed defect; must-fix; high confidence.** Independently actionable after BACKEND-01 is fixed.

**Evidence and trigger:** authenticated `POST /oauth/authorize` at `apps/backend/src/api/routes/oauth.controller.ts:63` has no role policy and passes the current user/workspace to `createAuthorizationCode` at `:82`. An active USER can approve an existing valid OAuth application; its client exchanges the code with its own required secret. `libraries/nestjs-libraries/src/database/prisma/oauth/oauth.service.ts:103` performs that exchange and issues a `pos_` token. The lookup at `oauth.repository.ts:184` requires `revokedAt: null` and already loads the user's current organizations, role, and disabled flags at `:209`.

`apps/backend/src/services/auth/public.auth.middleware.ts:21` handles those tokens but checks only the user's activation (`:32`) and any required organization subscription (`:40`). It ignores the loaded memberships and installs a synthetic administrator organization at `:53`. The public post-creation/deletion paths described in BACKEND-01 therefore remain reachable after the member is removed, disabled, or demoted; a USER can also consent to authority they never had through the ordinary UI.

**Smallest safe change / acceptance:** require an active matching membership when consenting and on every token use. Restrict grants to the role authorized for the requested actions and enforce current role on mutations; do not preserve elevated rights by copying the issuance-time role. Verify missing/disabled membership, demotion, revoked grant, and blocked account all prevent writes, while legitimate allowed roles still have the intended read/write operations.

**Value / tradeoff:** makes revocation through workspace administration effective; integrations relying on old implicit administrator grants need a documented reauthorization path. This finding is specific to legacy public-API OAuth. Current MCP bearer verification rechecks membership, disabled status and current role (`libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.service.ts:374`), and does not accept `pos_` tokens.

### BACKEND-04 — P1 / high: cookie-authenticated POSTs can mutate state from an untrusted origin

**Confirmed defect; must-fix; high confidence, browser execution conditional on the cookie being sent.**

**Evidence and trigger:** production login/OAuth writes the `auth` cookie with `SameSite=None` (`apps/backend/src/api/routes/auth.controller.ts:408`); middleware accepts it at `auth.middleware.ts:35`. The CORS origin array at `apps/backend/src/cors.options.ts:44` suppresses response access for an untrusted origin, but the installed CORS middleware continues a simple POST. `apps/backend/src/main.ts:35` does not install a general cookie-mutation origin guard. The installed Nest Express adapter enables URL-encoded parsing (`node_modules/@nestjs/platform-express/adapters/express-adapter.js:188`); its core application enables body parsing unless explicitly disabled. `/api/` goes directly to backend through `var/docker/nginx.conf:139`.

Concrete reachable examples:

- An HTML form with a string `prompt` can POST to `/api/media/generate-image-with-prompt`. `ImagePromptBodyDto` permits exactly that string (`libraries/nestjs-libraries/src/dtos/routes/single-field.dto.ts:110`); `apps/backend/src/api/routes/media.controller.ts:91` checks EDITOR but does not verify Origin/JSON. With an editor/admin's cookie, configured model credentials and remaining allowance, it reaches paid generation and saves an image (`libraries/nestjs-libraries/src/database/prisma/media/media.service.ts:85`).
- A bodyless form POST to `/api/user/api-key/rotate` reaches `users.controller.ts:410`. Its ADMIN policy proves who is signed in, but no origin check proves who initiated the request; it rotates the key and can break API consumers.

**Impact:** an external page can spend the victim workspace's generation allowance or rotate its API key without reading the response. Third-party-cookie blocking may prevent a particular cross-site attempt; it is not the server's authorization boundary and does not cover all same-site/untrusted-origin deployments.

**Smallest safe change / acceptance:** enforce the existing same-origin/JSON or an equivalent CSRF contract for cookie-authenticated mutations centrally or across every affected door. Preserve multipart upload, explicitly authenticated API clients, and configured split frontend/backend deployments. Do not change SameSite blindly and break OAuth. Verify untrusted-origin form POSTs are rejected before model execution/key update; intended JSON and multipart callers still work.

**Value / tradeoff:** protects several state-changing routes with one coherent boundary; compatibility must distinguish ambient cookies from explicit caller credentials. Existing `tests/backend.cors.test.cjs:183` checks missing CORS response headers, which does not establish mutation refusal. `tests/same-origin-mutation.test.cjs:191` recognizes this exact cookie risk, but its protected list at `:199` omits these two doors. Pure local diagnostic below confirms CORS continuation plus accepted prompt DTO.

### BACKEND-05 — P2 / medium: multipart R2 operations are not bound to a tenant

**Confirmed missing authorization fence; high-value improvement; conditional exploit, high confidence in source / medium in practical exposure.** Requires Cloudflare R2 configuration and knowledge of another in-progress upload's exact `(key, uploadId)` pair; no discovery path or active production R2 configuration was proved.

**Evidence and trigger:** editor-authorized `POST /media/:endpoint` at `apps/backend/src/api/routes/media.controller.ts:171` resolves an organization but does not pass it to `handleR2Upload` at `:179`. The global handler at `libraries/nestjs-libraries/src/upload/r2.uploader.ts:60` has no tenant identity. Creation generates a bucket-global random key and returns its upload ID (`:108`). `prepareUploadParts` at `:139` and `signPart` at `:264` sign arbitrary client-supplied pairs; `listParts` at `:170`, completion at `:189`, and abort at `:245` forward the pair to R2 without ownership validation. Completion registers the resulting object in the caller's organization (`media.controller.ts:188`).

**Impact / limit:** if the pair is disclosed, another tenant editor can get upload-part signatures, inspect/abort the unfinished upload, or complete and register it under their organization. This is not evidence that an arbitrary completed object can be deleted or that random key guessing is feasible. If the intended security model treats the pair as a transferable bearer capability, that exception needs an explicit product/tenant contract; current routing otherwise uses workspace isolation.

**Smallest safe change / acceptance:** bind server-created upload sessions to organization, owner where appropriate, key, upload ID and expiry; reject foreign pairs before either signing or sending an SDK command. Preserve legitimate completion/retry. With fake R2 commands, verify two tenants cannot sign/list/complete/abort each other's sessions and valid uploads still complete. A prefix without checking the recorded owner does not solve disclosed-pair authorization.

**Value / tradeoff:** protects the object-storage tenant boundary; introduces short-lived upload-session state and a cleanup policy. Prioritize against whether this upload mode is actually enabled; this audit did not inspect secrets or live buckets.

## Other bounded, already reviewed findings

These are independent of the five security candidates above. They are retained to avoid losing concrete in-scope debt; they do not require additional review chains or live provider calls.

### BACKEND-06 — P2 / medium: inherited image/video credits use a non-atomic check then reservation

**Confirmed concurrency defect; must-fix where those quotas are enabled; high confidence.** `MediaService.generateImageIntoLibrary` checks at `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts:90` before generation; video checks at `:168`. `subscription.service.ts:226` computes remaining credits from a separate aggregate; `subscription.repository.ts:272` later inserts a credit row unconditionally and calls the provider. Two requests with one credit remaining can both pass and perform paid work. The newer serializable `AiUsageService` admission enforces a different AI-operation limit, so it does not enforce a smaller image/video allowance. Image quotas intentionally apply only when `STRIPE_PUBLISHABLE_KEY` exists (`media.service.ts:69`); the unbilled instance's counter behavior is not a pricing defect.

**Acceptance / smallest change:** atomically reserve within the inherited organization/type/period allowance before external work; keep provider execution outside a long DB transaction. Two overlapping synthetic requests with one credit must produce one provider invocation and one reservation. Preserve current failure/refund semantics and unbilled-image behavior. **Value/tradeoff:** prevents overspend of configured allowances; changes an admission boundary, not product pricing. No provider was invoked in this audit.

### BACKEND-07 — P2 / medium: explicit material channel can disagree with the requested platform

**Confirmed functional/data-integrity defect; high-value improvement; high confidence.** `POST /content-intelligence/materials/:id/draft` requires EDITOR and post allowance (`apps/backend/src/api/routes/content-material.controller.ts:175`). `ContentMaterialService.createDraft` at `libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts:494` accepts a validated requested platform but, when `integrationId` is supplied, selects any active organization channel at `:502`. `content-material.repository.ts:252` returns `providerIdentifier` without filtering it, and the service never compares it with `PLATFORM_PROVIDERS[platform]` (`material-presentation.ts:116`). The transaction writes the actual channel into the Post and requested platform into its ContentDerivation (`content-material.repository.ts:285`). For example, `platform: 'telegram'` plus the workspace's VK integration creates a VK draft recorded as Telegram provenance.

**Acceptance / smallest change:** reject a supplied channel whose provider is outside the requested platform's provider set, before writes; matching channels continue to work and mismatch creates neither Post nor ContentDerivation. **Impact/value/tradeoff:** prevents a draft appearing under the wrong publication destination and false provenance; a narrow validation change. The endpoint creates a DRAFT and does not itself publish externally.

### BACKEND-08 — P2 / medium: generic mail/video paths log raw personal/content data

**Confirmed privacy defect; high-value improvement; high confidence.** `libraries/nestjs-libraries/src/services/email.service.ts:155` logs the whole provider result; `:159` logs raw provider errors; `:178` explicitly logs the recipient address on failure. This path is reached by `sendEmailSync`, including password-reset notifications from `apps/backend/src/services/auth/auth.service.ts:644` through the V2 email activity (`apps/orchestrator/src/activities/email.activity.v2.ts:25`). Separately, editor-authorized `/media/generate-video` calls `MediaService.generateVideo`, which logs arbitrary `body.customParams` at `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts:192` before validation. Those parameters can contain user-authored prompts and media inputs. The bounded Sentry/error-ledger contracts do not sanitize stdout.

**Acceptance / smallest change:** replace these payload logs with fixed outcome/error codes and a safe opaque correlation ID; preserve delivery/retry and provider failures. Capture logs with synthetic recipient/prompt sentinels and verify their absence on success and failure. **Impact/value/tradeoff:** avoids retaining mailbox addresses and private creative input in runtime logs; debugging must use safe structured outcomes. No mail, video or log-store access was performed. No unproved claim that every provider error contains a credential is made.

### BACKEND-09 — P2 / medium, lower priority: avatar relation can connect a foreign workspace's Media row

**Confirmed relational authorization gap; high-value improvement; high confidence, conditional on a known foreign media ID.** `POST /user/personal` at `apps/backend/src/api/routes/users.controller.ts:274` passes user ID and body only. `libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts:1414` connects `body.picture.id` at `:1432` without verifying organization, active membership or deleted status. `Media.organizationId` is required (`schema.prisma:347`). `getPersonal` at `users.repository.ts:1391` then returns that connected media's ID/path.

**Acceptance / smallest change:** require that the referenced active media belongs to a workspace where the current user has an active membership; preserve legitimate avatars across the user's own workspaces and existing avatar-retention behavior. A known foreign/deleted media ID must fail without updating the user. **Impact/value/tradeoff:** prevents attaching/reading foreign media metadata through a global user relation; existing media URLs may already be public, so this is not a demonstrated private-blob exfiltration. Membership-aware validation is safer than assuming avatars must always belong to the currently selected workspace.

## Diagnostics and existing evidence

No acceptance suite, build, live account, live key, provider call, database write, socket/network request or mutation was run. Two small in-memory diagnostics used current source and installed contracts with synthetic inputs:

1. CORS + prompt DTO: transpiled the current `cors.options.ts` and `ImagePromptBodyDto`, invoked the installed CORS handler using a synthetic POST from `https://untrusted.example`, and validated a string form prompt. Result:

   ```json
   {"case":"cross_origin_simple_post","corsAllowedOrigin":null,"reachesHandler":true,"stringFormPromptDtoValid":true}
   ```

   This proves middleware continuation/DTO validity, not a complete browser exploit or a model call. Existing source tests cover CORS response headers and selected same-origin account mutations; they do not prove these concrete two handlers refuse form POSTs.

2. Reset JWT: transpiled current `libraries/helpers/src/auth/auth.service.ts` with `esModuleInterop`, used Node `22.23.2`, a fixed audit-only secret, and `{id:'synthetic-user', expires:'2000-01-01 00:00:00'}`. Signed and verified entirely in memory. Result:

   ```json
   {"case":"expired_reset_claim","signatureAccepted":true,"customExpires":"2000-01-01 00:00:00","standardExpPresent":false,"purposePresent":false}
   ```

   Source inspection establishes that `AuthMiddleware` uses precisely that verifier/ID gate. No real JWT/secret was read or printed. An initial diagnostic transpilation omitted default-import interop and failed before signing; rerunning with the actual interop contract produced the result above.

Reviewed relevant existing tests as evidence, without executing them: `backend.cors.test.cjs`, `same-origin-mutation.test.cjs`, `password.policy.contract.test.cjs`, `user-password-change.test.cjs`, `user-identity.auth.test.cjs`, `content-material.routes.test.cjs`, AI-usage execution coverage, and source-level role/tenant guards. Test presence was not counted as successful runtime acceptance. Root independently owns runtime/recovery and acceptance checks.

## Reviewed inventory and safe compatibility

Read repository `AGENTS.md` and `.codex/project-index.md` sections for backend boundaries, content-intelligence, agent/MCP, privacy, AI admission and Prisma. Used the explicitly assigned sibling Graphify map at `/home/me/code/content-factory-next-worktrees/editorial-release-20261008/graphify-out/graph.json` as read-only orientation after its `GRAPH_REPORT.md`. Its baseline SHA is `e2ec588dca449dcbaefe1b2a56ef42bcb2408a6d`, different from current HEAD. Focused `graph_context.py` queries covered `AuthMiddleware`, `AiUsageService`, `AgentThreadsService`, `PieceRepository`, and `ContentSourceRegistryService`; returned file hashes for selected neighborhoods matched current files. The thread graph had no useful call edges, so exact current implementations determined that path. No graph was rebuilt or logging/hooks enabled.

| Domain / entrypoints inspected | Source conclusion or limit |
| --- | --- |
| AuthController, AuthMiddleware, UsersController, OAuthAuthorizedController, PublicAuthMiddleware, public post endpoints, role policies and organization/user repositories | Findings 01–04 and 09. Existing active-membership session gate, shared role helpers, password hashing/policy and protected account mutations are functional; they do not justify removing old interfaces by name. |
| MCP OAuth/bearer, AgentController and AgentThreadsService, capability registry | Current MCP rechecks active membership/current role; chat scopes threads to organization + user, verifies ownership before charging, binds pending resume/run claims, and restricts capabilities by the shared role table. No equivalent confirmed tenant defect found in inspected paths. Not a real SDK/client acceptance claim. |
| AiUsageService / resolver / OpenAI call lifecycle, inherited media generation and subscriptions | Inspected serializable included-operation admission, workspace-key versus included mode, nested-operation reuse, acting-user attribution, stale admitted-operation handling and streaming finish/failure. The instance `-1` allowance is converted to infinity intentionally; no unlimited-quota defect. Finding 06 concerns the separate inherited credits counter. Invoice/provider-cost reconciliation remains an explicit owner defer. |
| Content-source controller/registry/run lifecycle, content-context/fact repositories, brand-profile drafts, voice locks, material/piece flows | Inspected tenant filters, rights/robots/network-policy boundary, source leases/revalidation, evidence/fact association, context selection, versioned draft writes and optimistic revision/default-avatar transactions. Finding 07 is a concrete material-draft mismatch. Voice lock renewal failure/fencing and real external reading/model usefulness were not established as defects by this bounded review; they remain verification limits. |
| Prisma persistence / schema and organization, user, media, OAuth, subscription, content/material repositories | Tenant scope is usually explicit in repositories; Findings 01, 03, 05 and 09 identify exceptions at output/identity/SDK/nested-relation boundaries. Did not run migrations, schema apply, database introspection or production persistence changes. |
| Sentry/error collection, error-ledger payloads, product/growth events, generic mail/video logging | Sentry disables default PII/log/trace collection and uses bounded event serialization; error ledger uses bounded fields/fixed messages, rather than raw bodies. Product events use allowlisted authenticated fields, bounded enums and dedupe. Finding 08 bypasses those protections through stdout. Did not inspect private monitoring output. |
| Public post preview/comment paths, enterprise/operator interfaces, historical prompt/activity versions | Public read paths and signed/operator contracts are compatibility surfaces, not automatically unfinished. Empty lists, disabled features and historical version names alone are not defects. No removal task recommended without a current consumer/contract proof. |

## Exclusions and confidence boundaries

- Integration-provider implementations, provider reconnect/one-time-token updates, social publish side effects and `postSocial → streak.start` retry behavior belong to the separate providers reviewer. Findings from that stream are not duplicated here.
- Frontend design/UX, release/container/health/runtime orchestration, scheduler recovery, production schema state, paid provider semantics, external integrations and real browser/provider/client acceptance belong to root or other assigned streams. The relevant backend routes/callers were inspected only to establish source reachability.
- No external SDK-version assertion was needed: CORS, JWT and Nest parsing conclusions use installed/source contracts. No browse request or paid documentation/model service was used.
- Legal/pricing decisions, invoice reconciliation, offsite recovery, ChatGPT consumer/client acceptance and owner-provided business facts are not recast as code fixes.
- This is a bounded cross-module audit, not an assertion that every route or every Prisma operation is defect-free. Conditional R2 configuration and known-ID prerequisites are stated explicitly. Missing runtime/browser/race proof is UNKNOWN; source proof does not close those acceptance gates.
