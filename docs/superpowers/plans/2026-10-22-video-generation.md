# Video V1 — external API implementation plan

**Epic:** `content-factory-next-zlq6` / [HONEY-5940](https://linear.app/elwork/issue/HONEY-5940). **Revision:** 3, 22 October 2026, after four owner-supplied reports.
**Goal:** Source-backed piece -> editable prompt/script -> external API -> owned video preview/download in Content Factory.
**Spec:** [Research reconciliation and verified sources](../../research/video-generation-reconciliation-2026-10-22.md). It supersedes unresolved choices in revision 2; the [original research/prompt pack](../../research/video-generation-2026-10-22.md) is historical.
**Delivery scope:** Epic preparation. Research `.1` is complete; implementation `.2`–`.7` remains. This document does not claim provider QA or authorize paid calls, credentials, publishing or deployment.

## Product and provider decision

Both modes ship: **generative clip** and **AI presenter**. The user selects output locale, reviews/edits the prompt/script and actual route/settings/cost estimate, launches from our UI/chat, follows status and receives a media file. Source content remains unchanged.

Use **Higgsfield** for clips: Wan 3.0, Kling 3.0 Standard and Pro configurations. These are candidates for economy/value/higher-quality preferences, not a proven ranking. Begin with explicit provider/model choice; no autonomous marketplace or paid fallback. Use **HeyGen `POST /v3/videos`** for a presenter speaking our prepared script. **Runway** is the documented reserve if account/capability/pilot evidence disqualifies Higgsfield, not a third mandatory adapter.

Higgsfield's documented deduplication and request estimate reduce integration uncertainty; its promotion is not permanent product pricing. HeyGen's direct script input keeps factual control and the initial scope small. Provider-composed video through Video Agent is optional.

**Non-goals:** local montage/timeline/storyboard UI, per-shot DAG, rendering/encoding/FFmpeg/Remotion, separate TTS/alignment/lip-sync, local subtitle burn-in or format conversion, social publishing, custom likeness/voice cloning, a new wallet/subscription product, consumer-site browser automation. Provider-side editing/composition is not a launch dependency. No mandatory 4K.

## API baseline

| Adapter | Submit | Constraints/result |
|---|---|---|
| Higgsfield Wan 3.0 | `POST /alibaba/wan-3.0/text-to-video` or `/image-to-video` | 2–30 s, 480p/720p/1080p; distinct text/image schemas |
| Higgsfield Kling 3.0 | `POST /kling-video/v3.0/std/text-to-video` or `/image-to-video`; equivalent `pro` paths | 3–15 s; variant-specific options; audio capability does not guarantee any spoken locale |
| HeyGen presenter | `POST /v3/videos`, prepared script, compatible voice/avatar/engine, MP4 | `GET /v3/videos/{video_id}`; target script lengths such as 15/30/60 s are estimates, not guaranteed API durations |

Bases: `https://api.higgsfield.ai` and `https://api.heygen.com`. Higgsfield returns request/status handles; normalize its states inside its adapter. The spec links exact endpoint evidence. Recheck changed schemas before implementation; do not copy report examples blindly.

Offer 9:16 and 16:9, plus 1:1 only where supported. Set requested values explicitly. Catalog entries carry endpoint/model, input/duration/ratio/resolution/audio/locale constraints, dated price evidence and separate documented/account-available/sample-verified levels. Keep this a small configuration, not a catalog crawler.

## Brief and request contract

A compact `VideoBriefV1` contains:

- Piece ID/revision, author intent, audience and one key message.
- Source-linked facts with `must_include` / `context_only`, unsupported implications to avoid.
- Mode, output locale, visual intent/style and owned reference Media IDs.
- Duration/aspect, audio/caption wishes, presenter script and `exact` / `adaptable` policy.

The LLM prepares semantic content; a deterministic adapter validates API fields. Never submit arbitrary model-produced JSON to a paid API. Sources/reference text are data, not tool instructions. For image-to-video preserve the reference and describe motion. For a presenter prepare speakable text in the selected locale while preserving canonical names, numbers, dates, units and negations. Exact-script policy prohibits silent rewriting after confirmation.

Keep interface, source, control-prompt, spoken and subtitle languages separate. No global ru/en-only restriction, English-only control prompt, universal word limit or syllables/second formula. Unsupported locale/voice/audio combinations stop before spend; a silent clip's language concerns meaning, not a promise of generated speech/text.

Persist the editable draft and immutable submitted snapshot: prompt/script, source revision, route/settings, reference identities, selected voice/locale, payer mode and estimate. Semantic changes invalidate preflight. Preparing a prompt can consume existing text-model allowance but never launches video. Preview and launch reuse existing intent/confirmation behavior; no repetitive approval dialogs. Reload/reconnect is not a new generation. Another result or changed settings means a new explicit intent and visible cost.

## Async, ownership and spend

Inherited `VideoAbstract.process(): Promise<URL>` is synchronous. Add a separate async contract in the existing videos module; preserve legacy routes. Reuse admission, receipts, storage and durable execution, not a new scheduler.

Proposed shared doors:

- `POST /media/video-prompts`: prepare/save a source-backed draft and validated options.
- `POST /media/video-jobs`: launch one authorized immutable snapshot and return local job ID.
- `GET /media/video-jobs/:id`: observe/reopen the job and eventually return owned Media ID.
- `POST /media/video-jobs/:id/cancel`: only supported provider cancellation.

Final DTO naming can follow repository convention. UI and chat use the same services and authorization. Every reference/status/cancel access is tenant-scoped; provider IDs are not authorization.

Persist one minimal Prisma/repository `VideoGenerationJob`: tenant/actor, piece/input revision and submitted snapshot, route, logical attempt/idempotency key, provider IDs, credential configuration reference (no plaintext secret), state/error/timestamps, estimated/known/unknown cost and result Media ID. No VideoProject/Shot/Export subsystem. Chat receipts reference this domain job; UI-created jobs must not rely on chat memory.

Distinguish prepared, submitting, queued/running, provider success, saving, completed, failed, canceled and uncertain outcomes. Equivalent internal states may combine, but a failed download must remain distinguishable from failed generation. Completion means owned media saved. Reopening returns the same result.

One owner controls bounded retries across SDK/adapter/worker/agent. Higgsfield may recover an ambiguous submit only with the same endpoint/body/webhook and persisted key. Re-signing a reference URL changes that body; prepare stable references first. A mismatch never creates a new key automatically. HeyGen equivalent deduplication is unproven: lost submit response stays uncertain pending reconciliation. Reads/downloads retry separately. Provider spend is not erased by failed ingestion or local cancellation.

Start with server-owned polling through existing durable execution; callbacks are optional. If used, authenticate them, bind the stored tenant/job and verify provider status before import. Duplicate/out-of-order events cannot create jobs or regress terminal state. New Temporal contracts must be versioned; used contracts are immutable.

Follow existing `included` / `workspace_key` ownership. Extend encrypted per-provider key settings; do not overload the OpenAI/OpenRouter slot or expose secrets to client/model/logs. Included video stays unavailable until operator credentials and an explicit spend policy are configured. Monthly operation/video counts are not a monetary ceiling. Never silently switch payer/provider; no new retail tariff is chosen here.

## Current source and file ownership

Inspected at `e326aab7a7940814bc63f6dc229b018e53c759ac`; recheck concurrent work before implementation. Graph baseline `dd67538d` is stale globally; VideoManager/media files matched indexed hashes and current source was read. Database module changed. No rebuild is needed for planning.

| Area | Existing files / proposed additive targets |
|---|---|
| Source | `libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts` |
| Video domain | `libraries/nestjs-libraries/src/videos/video.interface.ts`, `video.manager.ts`, `video.module.ts`; add `video-brief.v1.ts`, `video-job.service.ts`, `video-provider.v1.ts` |
| Adapters | New `libraries/nestjs-libraries/src/videos/providers/higgsfield.provider.ts`, `heygen.provider.ts` |
| Persistence | `libraries/nestjs-libraries/src/database/prisma/schema.prisma`; new `database/prisma/video-generation/video-generation.repository.ts` and additive migration |
| Doors | `apps/backend/src/api/routes/media.controller.ts`; video DTOs under `libraries/nestjs-libraries/src/dtos/videos/` |
| Keys/admission | `libraries/nestjs-libraries/src/openai/ai.provider.config.ts`, `ai.provider.service.ts`, `ai.usage.service.ts`; `dtos/settings/ai.provider.dto.ts` |
| Chat | `libraries/nestjs-libraries/src/chat/capabilities/catalogue/media.capabilities.ts`, `capability.registry.ts`, `agent-parts.contract.ts`; preserve `chat/conductor/agent-operation-receipts.ts` fences |
| Media | `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts`, `media.repository.ts`, `libraries/nestjs-libraries/src/upload/` |
| UI | `apps/frontend/src/components/videos/video.wrapper.tsx`, `video.context.wrapper.tsx`, `video.render.component.tsx`; small new prompt/job controls here |
| Execution | `apps/orchestrator/src/workflows/` / `activities/`: add a versioned path only as needed |

Before UI work read component inventory/authoring rules; reuse SWR/useFetch/design tokens, update `docs/design/component-inventory.md`, cover existing interface locales. Video gets a capability-driven locale contract; do not widen unrelated `dtos/content.language.ts` en/ru DTOs. Legacy Veo/slides/Transloadit is not a new montage foundation. Other inherited presenter integrations do not prove the new piece-to-video flow.

## Scope and task ledger

Seven identities/dependencies remain. Linear through Beads owns status; this is acceptance mapping, not a parallel task-status ledger.

| Criterion | Owner |
|---|---|
| Four reports, provider decision, conflicts and bounded unknowns | `.1` |
| Grounding, editable prompt, output locale, preflight | `.2` |
| Domain job, actor/tenant/payer, admission, deduplication and recovery | `.3` |
| Higgsfield routes and honest clip options | `.4` |
| HeyGen script presenter and voice/locale compatibility | `.5` |
| UI/chat progress, owned preview/reopen/download | `.6` |
| Integrated acceptance and real quality/cost evidence | `.7` |

### .1 — Research reconciliation and API selection

**Boundary/files:** Research/spec and this plan; no application change.
**Acceptance delivered:** Four reports compared, selected public schemas/prices checked, conflicts resolved, minimal two-provider portfolio selected. Evidence: source archive/hashes, primary URLs, corrected HeyGen price, test proposal. Account access/language quality/current quote/use terms remain explicit real-provider gates, not presumed facts.
**Checks:** Docs links/diff and scope review. Do not reopen generic research or adopt report code as verified integration.

### .2 — Editable prompt/script with language selection

**Files:** Piece service, video brief/compiler and DTOs, minimal prompt controls, shared chat preparation door.
**Interface:** Piece revision + intent -> saved editable brief/script -> validated request snapshot. No video generation.
**Acceptance:** Save/reopen preserves edits, locale and references; a date, decimal and negation survive adaptation; source injection cannot override cost/provider policy; unsupported combinations make zero video calls; no fabricated facts. Prompt preparation uses existing text-model settings/admission.
**Verification:** Focused transformation/preflight contracts, not wording snapshots.
**Rollback:** Hide new entry point; preserve pieces and existing generation.

### .3 — Durable jobs, payer isolation and bounded spend

**Files:** Job service/repository/schema/migration, provider interface, shared doors, encrypted settings/admission, new versioned execution path if required.
**Interface:** Authorized immutable snapshot -> local job -> provider receipt/status.
**Acceptance:** Duplicate/concurrent launch creates one logical job; reload/restart resumes provider ID; unknown submit uses provider-specific recovery; no hidden payer/model fallback; cross-tenant read/cancel denied; no-key/no-budget state submits nothing. Cancel request differs from confirmed cancellation. Cost survives errors and restart.
**Verification:** Fake-provider call counters, persistence/recovery and tenant tests; additive migration review. Reuse a valid MP4 fixture; no rendering test. Rerun affected agent Stop/receipt checks.
**Rollback:** Disable new launches while allowing accepted jobs to finish/save; retain records, never delete/replay them automatically.

### .4 — Higgsfield finished generative clips

**Files:** Higgsfield adapter, bounded model catalog and provider configuration; reuse `.3`.
**Interface:** Validated text/image parameters -> exact account estimate -> immutable submission -> status -> provider file URL.
**Acceptance:** Wan/Kling Standard/Pro options are limited to documented/account-available combinations; explicit ratio/duration/audio; tenant-owned references have a stable lifetime. Same-key deduplication retry preserves payload; mismatch/throttle/poll timeout never creates a new generation. Result goes to `.6` without local assembly. Quality labels remain qualified.
**Verification:** Schema-derived fixtures plus success/uncertain/error paths; real output/account costs belong to `.7`.
**Rollback:** Disable affected catalog entries without changing legacy paths.

### .5 — HeyGen presenter from our script

**Files:** HeyGen adapter, voice/avatar/engine catalog and small presenter controls.
**Interface:** Prepared script + compatible locale/voice/permitted avatar -> `POST /v3/videos` -> status/result -> MP4.
**Acceptance:** No silent script/locale rewrite; unsupported combinations make zero calls; exact engine is chosen without hidden cost escalation; lost submit response is not a new video. Preserve actual duration/cost; stock/permitted assets, no custom cloning; no separate audio pipeline.
**Verification:** Mocked catalog/create/status failures and shared recovery; actual pronunciation/facts/lip-sync in `.7`.
**Optional, not required:** `/v3/video-agents` in generate mode for composed video. If later enabled, use flat v3 schema, private/incognito session, preserve session/video IDs and verify language/facts. Chat-mode editing, scene APIs and Cinema Studio stay out of launch scope.
**Rollback:** Disable new presenter jobs, keep stored results.

### .6 — Existing media, visible progress and download

**Files:** Media/storage boundary, shared controller/chat contracts, videos UI and component inventory.
**Interface:** Provider result -> bounded import -> tenant-owned Media ID -> player/download.
**Acceptance:** Both formats show preparing/generating/saving/success/failure/uncertain states and reopen across sessions. Saved files work after provider URL expiry. Interrupted import retries download only; duplicate completion saves one result. Validate HTTPS destination and each redirect, reject private/link-local addresses, bound bytes/time and verify actual video type. Never fetch an arbitrary model-supplied URL. Tenant denial holds; source remains unchanged; returned format/resolution/audio are truthful.
**Verification:** Ingestion/tenant/duplicate contracts plus a local browser journey for both fixtures: edit, launch, reopen, play, download. Same services for UI/chat. No transcoding workaround.
**Rollback:** Hide new entry points and retain saved media.

### .7 — Integrated acceptance and bounded real-provider pilot

**Files:** Focused integration/evaluation cases and evidence in the eventual implementation stage; update catalog/spec with observations.
**Engineering proof:** Roles, unsupported/no-key cases, duplicate/uncertain writes, restart, tenant denial, expired provider links, both chat/manual flows and both modes. One root-owned acceptance set. Full build/suite only for release or concrete broad risk.
**Proposed pilot:** Five briefs × raw/prepared × two attempts = **20 generations**. Same model/settings/references within each pair. Cases: Wan product-image motion; Kling Standard with supported native audio; Kling Pro with a more demanding motion brief; a presenter with date/number/negation in one non-English locale; another presenter locale. This covers all three proposed clip choices and the presenter route. Choose actual supported languages; no product-wide ru/en limit.
**Quality acceptance:** Every publicly enabled route has a viewed sample and truthful evidence level. Accepted samples do not alter required facts, lose negations or use the wrong language. Record first-pass acceptance, defects, elapsed time, every paid attempt and cost per accepted result. A competent speaker reviews claimed language quality. An inconclusive raw/prepared comparison stays inconclusive; fixtures cannot establish prompt usefulness or speech quality. This small pilot is not an all-model ranking.
**Paid/activation gate:** Record actual account/credential-owner mode, applicable API terms, exact configurations, total attempt cap and monetary ceiling; then obtain separately required current spend authority. Missing authority allows fake-provider engineering but prevents claiming provider acceptance. No retail SLA, third-party consent or resale rights inferred from docs/HTTP success; no blanket sales-contract requirement by assumption. Deployment is separate.
**Rollback:** Disable unaccepted routes, preserve sources/cost evidence/media. No unapproved paid fallback.

## Dependencies and first execution

`.1` -> `.2/.3`; `.2/.3` -> `.4/.5`; `.4/.5` -> `.6`; `.6` -> `.7`. Parent link is not an extra blocker.

Build a thin fixture journey before broadening options: piece -> editable prompt -> durable job -> fixture result -> existing player. Then connect Higgsfield and HeyGen through the same service. Work can span task boundaries, but a demo does not close unfulfilled persistence/security/quality criteria.

Research is settled enough to begin `.2/.3` once implementation is requested. Unknowns are bounded to actual account access, quotes, voice/locale quality, applicable use terms and provider acceptance. No extra Deep Research round or editor infrastructure is required.

## Preservation and planning verification

Preserved: both formats, language choice, transparent provider/price choices, editable grounded prompt, platform-controlled API job and owned downloadable result. Removed montage requirements stay removed; optional provider composition/editing never becomes mandatory through report examples.

Revision 2 and four reports are archived privately. This revision changes only planning documents and the existing tracker lineage. Planning checks: `python3 scripts/docs/check_docs.py` PASS (217 files), `git diff --check` PASS, acceptance/file mapping and seven-child tracker read. docs-reviewed: updated — research reconciliation, plan and navigation. graph-reviewed: used — stale local map for orientation, relevant current source verified; no structural change or refresh. No application test/build, paid generation or deployment is claimed.
