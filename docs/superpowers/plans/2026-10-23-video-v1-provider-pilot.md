# Video V1 real-provider pilot

**Prepared:** 23 October 2026, Europe/Moscow. Planning only; nothing here authorizes account creation, purchases, credential access/wiring or provider calls.
**Goal:** Establish account access, actual output/language quality, observed billing and an exploratory raw/prepared comparison through the implemented Content Factory flow.
**Owner/task:** `content-factory-next-zlq6.7` / epic `content-factory-next-zlq6` (HONEY-5940). Keep existing IDs and dependencies; both remain open.
**Baseline:** `codex/video-v1-api`, review corrections `df7b17a564d1cea5351e75bdc546933ae4f57757`. [Plan revision 3](2026-10-22-video-generation.md) stays unchanged. [Independent review and local proof](../../../.codex/stages/content-factory-next-zlq6-implementation-20261022/review.md).

## Access-route decision before funding

The owner-requested [subscription/manual specification](../specs/2026-10-23-video-subscription-access.md) and [implementation addendum](2026-10-23-video-subscription-access.md) now define tasks `.8`–`.12`. The existing `.7` remains responsible for real-account, subscription-credit and output evidence after local implementation. This adds no spending or account-connection authority.

This packet prices the **currently implemented direct-API route**, not every possible use of these providers. Subsequent [subscription-access research](../../research/video-subscription-access-2026-10-23.md) confirms official user-OAuth/MCP paths that consume existing subscription credits. Higgsfield MCP excludes web Unlimited; HeyGen's current technical index positions OAuth for trial-scale use and recommends API keys for regular pipelines.

Inventory existing subscriptions as well as API balances before proposing new funding. A native subscription connector is not implemented by this plan; first validate its client/account/tool eligibility under separately authorized connections and a credit-denominated budget. The $10 initial API deposit/$25 proposal below is therefore optional for the API pilot, not a universal customer prerequisite. Keep the API matrix intact until an owner decision selects a different access route; no subscription sample is silently added to its 20-job/spend allowance.

## Accounts, access and owner inputs

| Resource | What is needed for the future pilot | Smallest initial funding |
| --- | --- | --- |
| Higgsfield API | Owner-controlled API organization at [the console](https://console.higgsfield.ai), access to Wan 3.0 and Kling 3.0 Standard/Pro, billing visibility, a dedicated key ID + secret | $5 API balance |
| HeyGen direct API | Owner-controlled API workspace, API-wallet/top-up eligibility, public stock Studio Avatar supporting Avatar III and two suitable public voices, billing visibility, a dedicated API key | $5 API balance |
| Existing text provider | For actual AI preparation, the test workspace's existing `draft` role/model and its own authorized text allowance; video keys are separate | Reuse an existing authorized API balance; reserve at most $1 of the pilot ceiling |
| Content Factory test workspace | Owner/admin sets video policy; authorized editor/operator launches; owner or reviewer evaluates outputs | Existing isolated local environment; no production admin access required |
| Source assets | Five approved short pieces and two owned JPEG/PNG/WebP images, ideally already in Media; a competent reviewer for each selected spoken language | Existing assets; no image-generation purchase |

Higgsfield's API balance is separate from website plans and starts at $5; its API help page also describes team organizations and Billing/Analytics. This is a deposit, not the price of a pilot. [Official account/billing guide](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api).

HeyGen advertises API pay-as-you-go starting at $5 and separates direct API funds from web-plan credits. [Official API pricing](https://www.heygen.com/api-pricing), [API billing explanation](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained). However, current developer docs also describe `subscription_required` for accounts whose pay-as-you-go trial cannot be topped up. Confirm the actual account's purchase eligibility before payment; stop if it requires a subscription. Do not buy a web plan or assume the $10 starting proposal works for that account. [Account-specific billing errors](https://developers.heygen.com/docs/error-codes#subscription-required).

First inventory already-owned **API** accounts and balances. A paid web subscription alone does not establish API funding. Separate Kling/Wan accounts, custom avatars and voice clones are outside this pilot.

Owner decisions to record before execution:

- Account/organization owner and payer for each API, existing balance, and whether other users share the same billing pool. A dedicated pilot pool is preferred; shared usage must be distinguishable before claiming per-run costs.
- Two reviewable spoken languages. Suggested starting pair: Russian and English; choose supported account voices and a reviewer, rather than imposing a product-wide language restriction.
- Approved pieces/images and permission to send them to these providers. Synthetic/public-safe material can cover integration; business usefulness needs representative owner-approved material.
- Whether to authorize only the five-run first stage or the full 20-run matrix; monetary ceiling and any payment fees/taxes are recorded separately.

Later, after explicit credential authority, use the existing encrypted **test workspace** settings with an explicitly selected payer. Suggested pilot payer is `workspace_key`; never silently change inherited payer mode or copy production credentials. The owner can enter secrets directly; passwords, payment-card details and 2FA codes are not needed by the implementation chat.

For HeyGen, restrict the pilot key to `account:read`, `avatars:read`, `voices:read`, `videos:write`; write also grants video reads. Account read is for billing-mode/balance verification, not creation of avatars or voices. [Official permission mapping](https://developers.heygen.com/docs/api-key-permissions), [account verification](https://developers.heygen.com/docs/api-key). Higgsfield uses the key/secret pair server-side; confirm any account-specific model restrictions. [Official authentication](https://docs.higgsfield.ai/docs/authentication).

Image cases need **stable provider-reachable HTTPS Media URLs** with known dimensions and continued availability during processing/recovery. The implementation persists the existing owned Media URL; it does not upload a localhost file to the provider or mint a new URL on replay. A localhost-only file cannot serve these cases. If the isolated environment lacks suitable approved storage, pause the two image cases and record the storage gate; no tunnel, bucket or deployment is authorized by this plan.

## Budget proposal

**Minimum new deposit: $10 total, $5 per provider**, if those accounts accept the advertised self-serve top-ups. Existing usable API balances may reduce new funding to $0. This funds the entry check, not a guarantee that all 20 generations fit.

**Proposed full-pilot ceiling: $25 of generation charges**, including text preparation/chat. Top up incrementally only after exact quotes and owner payment authority; unused funds are account balance, not consumed generation cost. Taxes/payment/FX fees, if any, are disclosed and approved before purchase.

| Allocation | Proposed charge/reservation envelope | Meaning |
| --- | --- | --- |
| Higgsfield | $15 | Twelve clips; each exact account quote must fit $1.25 or the case pauses |
| HeyGen | $8 | Eight presenter jobs; $1 per-job admission reservation, subject to provider controls |
| Text preparation and any live chat | $1 | At most five accepted prepared candidates plus bounded chat turns; use current model pricing/limits before approval |
| Unallocated reserve | $1 | Still inside $25; do not use to increase attempt count or silently switch route |

Starting **application admission** policy in a fresh pilot workspace can be Higgsfield `maxCostUsd=1.25`, `monthlyBudgetUsd=3.75` and HeyGen `maxCostUsd=1`, `monthlyBudgetUsd=2`. That admits only the first three clips and two presenters. After their acceptance and within the authorized scope, widen monthly envelopes to $15/$8 for the remaining matrix. These values are provisional until quotes/account controls are known; they are not provider charge ceilings. The implementation reserves `maxCostUsd` for each job and retains unknown-cost reservations. Do not clear them or raise limits merely to bypass admission.

For the selected HeyGen Avatar III **Studio** configuration, the public rate is $0.99/minute of actual generated output. Eight exact 30-second outputs would be `8 × 0.5 × $0.99 = $3.96`. The 30-second setting is an editing target, not an API-enforced duration or maximum invoice; actual account pricing and seconds must be reconciled. An Avatar IV switch changes the budget and requires a new decision. [Engine/avatar rates](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained).

For Higgsfield, do not multiply promotional catalog starting prices into a budget. After later credential authority, get an authenticated estimate for **each frozen raw/prepared payload** and refresh expired quotes before launch. [Exact-account estimates and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention).

Before any paid launch, record provider-side spending controls or a documented prepaid exposure bound, disable automatic top-ups for the pilot, keep one in-flight generation, and verify remaining authorized exposure. A large shared wallet or the application's estimate/reservation alone does not prove a hard ceiling. If exposure cannot be bounded, stop and return the concrete account limitation; do not reinterpret $25 as unlimited permission.

## Fixed matrix: five briefs, twenty generation intents

Each row has raw/prepared variants and two repetitions per variant: **four jobs per row, 20 total**. Begin with the first **prepared** repetition of each row (five jobs); if accepted, run the remaining 15 within the same matrix. Do not add five smoke jobs on top of twenty.

| Case | Fixed route and settings | Input and acceptance focus |
| --- | --- | --- |
| C1 | Higgsfield Wan 3.0 **image-to-video**, 5s, 720p, 16:9, audio off | One owned product image; preserve identity, geometry and requested simple motion |
| C2 | Higgsfield Kling 3.0 **Standard text-to-video**, 5s, 16:9, sound on | Action/scene coherence and native audio; do not promise a spoken language |
| C3 | Higgsfield Kling 3.0 **Pro image-to-video**, 5s, sound off; owned 16:9 reference | More demanding motion; framing comes from the image, no unsupported resolution/ratio field |
| P1 | HeyGen `/v3/videos`, public Studio Avatar + **Avatar III**, public Russian voice, 30s target, 720p, 16:9, captions on | Approved short Russian script with a date, decimal and negation; factual speech, locale, captions and lip sync |
| P2 | Same HeyGen route/engine/output, public English voice, 30s target, captions off | Approved equivalent English factual brief; fluent speech and no factual additions |

Freeze the actual account-visible look/voice IDs and supported canonical locale (`ru`/`ru-RU`, `en`/`en-US` as appropriate) before launch. If stock Studio/Avatar III or the required voice is unavailable, record an account gate; do not silently select a custom asset or another engine. Exact endpoint fields remain in [the adapter evidence](../../research/video-v1-api-contracts.md).

Comparison rules:

- Raw means the saved minimally structured baseline; for presenters it must already be a speakable brief in the target language. Prepared means one actual existing `prepareWithAi=true` result per brief, using the recorded `draft` model/version and reviewed before video spend. Both variants use identical factual requirements, references, provider/model, voice/avatar, engine and options.
- Freeze both texts and settings before viewing outputs; randomize the remaining variant order and blind the reviewer to raw/prepared labels where practical. Record unavoidable safety/fact edits. Human-only preparation can test video integration, but cannot prove the AI preparation benefit.
- Two repetitions are exploratory. No supported fixed-seed control or statistical ranking is assumed. Mixed results remain inconclusive; no cherry-picked best sample becomes a provider ranking.
- Twenty means at most 20 distinct video intents, including failed/moderated/uncertain cases; there are no replacement generations or paid fallbacks. Log HTTP submit attempts separately. The implemented Higgsfield immediate replay can use the same persisted body/key once; it is not permission for a new intent. HeyGen ambiguity never triggers a new submission. Do not inject a paid-submit network failure to test this.

## Execution after separate authority

**Preparation completed now:** source/review inspection, current public account/billing research, matrix, budget and criteria. No authenticated catalog/estimate request, account action, key creation/read/wiring or paid model request was performed.

1. **Owner/account readiness.** Record the inputs above, applicable API terms for the intended product use, billing mode, top-up availability, allowed assets and cost controls. Owner grants the exact credential/read-check scope; configure only the isolated pilot environment. Production, publishing and deployment remain outside it.
2. **Preflight without generation.** Read account/catalogs, select actual assets/locales, verify owned HTTPS references, prepare/freeze variants under the separately approved text allowance, obtain quotes and save draft/version/preflight identities. Resolve any incompatible account/schema response locally before spend. Reconfirm the final spend scope and ceiling if inputs differ from the approved packet.
3. **First five jobs.** Run C1/C2/C3/P1/P2 prepared repetition 1 sequentially through the actual UI/chat. Use the Media UI for representative clip work and native chat confirmation for at least one presenter. Bound any real chat-model calls inside the $1 text envelope; preserve the reviewed paid snapshot. For one accepted run in each mode, reload/reconnect and restart the local worker during polling, then verify the same receipt, no new paid generation, saved player and authenticated download.
4. **Remaining fifteen.** Continue only after technical, factual/language and spend checks on the first five pass and the authorized exposure remains adequate. Any missing cost reconciliation or uncertain submit pauses new jobs. Finish the frozen paired matrix; no prompt retuning from observed videos.
5. **Closeout.** Reconcile provider usage/receipts against each paid intent, label observed versus unknown costs, review outputs and publish a local acceptance table. Disable new launches and auto top-ups; retain jobs/media and the key needed for any outstanding recovery. Rotate/revoke the pilot key only once no accepted job still needs it and the owner approves credential removal. Push/merge/deploy require their own authority.

## Acceptance, evidence and stopping

One root-owned pilot assessment on existing `.7`; no new task ledger or full release suite is needed for this plan.

- **Integration:** actual account/model/voice access; unchanged submitted script/settings; durable receipt/reopen/restart without a new intent; owned MP4 with the expected dimensions/audio/captions, browser playback and byte-verified authenticated download. Reuse matching local ACL/SSRF/concurrency evidence; paid calls do not need to reenact those negative tests.
- **Factual/language gate:** every accepted presenter preserves the required date, decimal, named facts and negation, introduces no invented claim, and passes a competent speaker's listening review. Inspect captions against speech when enabled. Account-visible language metadata or a successful request is insufficient.
- **Visual gate:** each accepted clip follows the requested action and reference identity without a material shape/product error. Record visible defects and acceptable use; do not infer all Wan/Kling capabilities from a five-second sample.
- **Comparison:** score factual preservation, instruction fit, visual/speech clarity and business usefulness on a proposed 1–5 rubric; factual/language errors are hard rejects, with no averaging them away. Record per-sample human accept/reject and rationale. Proposed quality threshold is at least 3/5 on each applicable dimension, subject to owner confirmation before execution. Report raw/prepared acceptance counts and observed costs per accepted result, not an unsupported significance claim.
- **Billing:** operator/owner captures redacted usage/balance/invoice evidence before and after sequential jobs, with timestamps and no unrelated traffic. Provider adapters do not currently return actual billed USD; a null application cost stays null unless supported billing evidence is reconciled. An estimate is never relabelled actual cost. A pending charge/refund remains unknown, with its exposure reserved.

Stop new launches on an uncertain submit, unexpected payer/route/engine, unavailable asset/language, wrong facts/language, unbounded remaining exposure, missing billing evidence, account subscription requirement, inaccessible image URL, or attempt/budget exhaustion. Preserve existing jobs/results and investigate without a new paid generation. Provider/server delays do not justify an automatic replacement.

Store a public-safe per-run table under the existing [implementation stage](../../../.codex/stages/content-factory-next-zlq6-implementation-20261022/outcome.md), recording case/variant/repetition, source and frozen request hashes, draft/job/provider receipt, exact model/settings, estimates and actual/unknown cost evidence, elapsed time, owned media hash/format/duration, reviewer verdict and defects. Keep keys, account identifiers, signed URLs and private originals outside Git.

Each required route needs a viewed accepted sample and its account/billing proof; each claimed spoken language needs competent review. If the comparison is inconclusive or a required gate is missing, keep that status explicit and leave `.7`/the epic open. A completed small pilot establishes only its tested configurations, not general provider quality, production readiness or resale rights.

## Document verification

Files affected by this preparation: this plan, the video navigation in `.codex/project-index.md` and a scoped handoff note. Run `python3 scripts/docs/check_docs.py`, review the diff and `git diff --check`; no application tests/build or paid checks are appropriate for a documentation-only packet. Prior engineering results remain tied to `df7b17a56`, not rerun or relabelled as provider proof.

Primary sources were checked publicly on 23 October 2026; account state remains unknown. Context7 documentation corroborated authentication/API references; official pages above own the dated billing claims. graph-reviewed: not applicable to this documentation-only plan; known implementation files were read directly, with no structural change or graph refresh.
