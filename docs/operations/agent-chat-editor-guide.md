# Chat and editor: local acceptance and release guide

The assistant uses native Mastra conversations, workflow suspension/resume and memory.
Research may read a public URL directly; unavailable sources remain explicit evidence
limits. It must not invent missing facts, actors or personal experience.

## Working context and questions

Use Context in the chat toolbar to select the avatar and channel. Existing defaults
are offered; an explicit selection controls subsequent work. An avatar supplies voice,
not new facts. The channel supplies formatting and preferred length; an explicit user
request has priority. A blocked source does not make the entire assignment fail.

Related clarification questions are prepared together. The interface shows the count,
lets the user move between answers and skip comments, and submits the completed batch
through native suspension/resume. Suggested answers are model-written. Answer history
remains expandable. Delegation does not authorize fabricated personal opinions.

## Drafts and series

A series is one expandable chat card with a link to every post. The assistant explains
why multiple posts were needed. The editor initially selects the latest series; earlier
series remain in history with date and post count. Opening a specific artifact selects
that exact post, including older drafts. Drafts are not silently deleted or published.

Edits to an existing draft show the complete proposal and wait for acceptance. Review
notes are advisory and belong to the whole evaluated series when appropriate. Author
comments are adapted in the avatar's voice while preserving their important meaning,
conditions and qualifications; verbatim quotation is not a default requirement.

## Campaigns from chat

Ask for an explicitly allocated batch, for example five Reels and ten Story frames
over two weeks. The campaign retains its channels, timezone, exact counts and item
revisions after reload. A Story unit is one frame; a carousel is one publication
with its own slide count. The campaign card shows planned topics, actual saved
text/assets, blockers and publication state, using the existing editor and calendar.
Telegram, Instagram, YouTube and Threads share this flow; TikTok uses its own
account/format/consent checks and explicit manual continuation where required.

Channel discovery uses the resolved company/channel brief and accepted findings.
RSS and an analytics subscription are optional. Without sources it proposes topics
from that brief, with no claim that they are measured trends. Web research is an
explicit option subject to existing access, rights and budget checks.

Choose a mode in the campaign card or chat. `prepare_approve` is the default:
prepare materials, inspect them, approve the saved revision, then schedule.
`collaborative` retains user questions and approval; `autopilot` may delegate
editorial choices to the configured advanced product model under a scoped grant.
Business facts, rights, platform consent and funding still need their own evidence.
Changing an autopilot grant invalidates affected agent actions but preserves
separately confirmed human scheduling. Revoke that scheduling grant or stop the
campaign to block its pending sends. Accepted provider work may still finish.

An autopilot grant can cover preparation without delivery. When scheduling or
publishing is outside its scope, preparation finishes as `ready`, with no automatic
approval or delivery attempt. That saved revision needs separate approval before
delivery; changing the default grant does not retrospectively approve it.

For Telegram, `campaign.plan_materials` offers material-specific lengths before
generation. Answer for each selected item, then continue `campaign.prepare` with
those choices and the same preparation request identity. Autopilot may choose
length within its editorial permission. A length selection is not publication
approval. Inspect the complete rendered Telegram text, including title and closing.

## Campaign edits and recovery

`campaign.edit` changes the selected caption/text, or one Threads post. It creates
a new native draft and invalidates the earlier approval. Caption edits leave text
inside PNG artwork, video speech and subtitles unchanged. Other campaign items
retain their completed work.
Video description edits share the production operation's revision and save
receipt. A failed local save can resume the same edit without another model
call. The script, scenes and existing cover stay unchanged; unfinished video
and unresolved editorial findings remain blocked. Active, uncertain or
launchable bound video work must settle before editing its description.

Use `campaign.revise` for a new authored instruction that changes one selected
material, including the text or layout of Story/carousel artwork. Unlike reinspection,
this may call the paid model and create new images. It retains old results/assets
and other items, invalidates the selected approval, and rejects unresolved earlier
work. Keep its author request ID on retries. If Telegram asks for a new length,
copy the returned `resumeInput` into `campaign.prepare`, changing only that item's
length selection/guidance. Keep its exact saved request ID and instruction; do not
start another revision to answer the length question.

`campaign.reinspect` explicitly checks a known saved model output without another
model call. It may normalize that output, reuse validated unchanged Story/carousel
PNGs or a validated existing video cover before video production is bound. It may
create the first artwork from saved frames when none exists. Video descriptions
are public copy, separate from narration, planned timings and subtitle files;
repairs derived from existing copy are marked for editorial review. An explicit
human caption edit survives later reinspection. This saves a new revision
requiring approval and never schedules or publishes. Unknown model
results and unresolved partial assets require reconciliation instead of replay.

Continue interrupted preparation against the saved campaign/item. The production
owner is bound to its content revision, so a new chat request identity does not
authorize a duplicate model call. Completed materials are reused; known checkpoints
resume remaining work. A changed instruction is an edit intent, not a retry.

Video preparation first saves the script, scenes and available cover as
`needs_video`. Bind a video production revision, inspect its provider/payer and
budget preflight, then confirm launch. Revise a scene through a new manifest using
the parent revision; unchanged approved generation jobs can be reused. Retry a
failed file import with `video.production_retry_save`, without generating again.
`campaign.finalize_video` checks the completed owned output, measured metadata and
caption evidence before saving the final native draft. A missing requirement stays
`needs_revision`; an outline or provider job ID is not a finished video.

Scheduling is distinct from publication. `campaign.reconcile` reads the existing
receipt journal without resending. An unknown send remains blocked until its
external outcome is established. Missing account capabilities or consent return
an explicit draft/manual path. See the [campaign specification](../superpowers/plans/2026-11-03-social-content-factory.md)
and [service contracts](../../libraries/nestjs-libraries/src/content-intelligence/social-factory/contracts/README.md).

## Verification boundary

The campaign workflow above describes implemented behavior, not live-provider or
release acceptance. Its actual runtime, editorial-quality, video-account and
publishing evidence must be recorded separately for the delivery candidate.

The accumulated local checks cover native questions, continuation, Stop, recovery,
series persistence, editor/history, context selection and responsive controls. Paid
quality sampling used isolated test conversations and retained the original records.
The final length sample was 1672 visible characters for a 1600–2400 target; its draft
was saved, but provider quota refused the later review/final chat response. This is not
proof that every editorial response is correct or that provider quota is unlimited.

Remaining qualifications are tracked in content-factory-next-eqh5 (broader editorial
quality), content-factory-next-uhkz (legacy body behavior) and content-factory-next-xyka
(local preview shutdown). Release acceptance and deployment are recorded separately.
