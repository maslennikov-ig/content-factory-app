# Social factory editorial playbooks v1

The editorial production helpers consume `EditorialMaterialV1` from the shared
social factory contract. They do not create a publishing grant or provider
receipt. The parent editorial service must append
`buildEditorialProductionInstructions(platform, format)` to its existing
channel-aware prompt, assemble real media, and call
`inspectEditorialMaterial(platform, format, material, inspectedAt)` before
offering that material for approval. Keep the existing Telegram formatting,
length negotiation, titles and limited editing in that path.

Source files live in
`libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/playbooks/`.

## Supported production outputs

| Platform / shared format | Output | Required assembly |
| --- | --- | --- |
| Telegram / `post` | Text or media post | Complete body, chosen length, parsed final text or caption; media and explicit text continuation when needed |
| Threads / `thread` | Conversation | Separate starter and substantive follow-ups in `posts`, with consecutive 1-based indexes |
| Instagram / `carousel` | One publication | Ordered `slides`, a real image for each, caption and explicit slide count |
| Instagram / `story` | One frame | Exactly one slide and its image/video; campaigns group separate frame items |
| Instagram / `reel` | Finished short video | Timed scenes, complete narration, final video, captions, cover and caption |
| YouTube / `short` | Finished Short | Timed scenes, complete narration, final video, captions, description and honest CTA surface |
| YouTube / `long_video` | Finished long video | Timed full scenes, composed final video, captions, cover, description and chapter starts |
| TikTok / `short` | Native short-video package | Timed scenes, final video, captions, cover, editable caption and explicit publishing/manual continuation |

Unsupported combinations fail explicitly. The playbook catalogue returns
defensive copies, so a request cannot mutate another channel's policy.

## Shared material fields and local assembly settings

Use shared typed fields `posts`, `scenes`, `slides` and `ctaSurface` directly.
Assets use shared `mediaId`, metadata and provenance; a rendering prompt or
provider job ID cannot substitute for an imported asset.

| Field | Meaning |
| --- | --- |
| `playbook.version` | `social-editorial/v1` |
| `playbook.sourceDate` | `2026-11-03` |
| `assets[].role` | Video: `final`; subtitle: `captions`; packaging image: `cover` |
| `settings.lengthChoiceId` | Existing negotiated Telegram material-specific choice; not an invented generic default |
| `settings.renderedText` | Final Telegram visible text after entity parsing, including title and CTA |
| `settings.renderedCaption` | Final visible media caption after entity parsing |
| `settings.telegramTextContinuation` | Explicit visible follow-up text when the full body differs from the media caption |
| `settings.maxPostCharacters` | Optional current selected Threads transport limit; platform publishing validates final account constraints independently |
| `settings.slideCount` | Explicit number of slides in one carousel publication |
| `settings.chapterStarts` | Ordered long-video chapter starts in seconds, beginning at zero |

Scene indexes begin at one; times start at zero and cover the final duration.
Each scene includes actual spoken text and a matching visual intention. A
seven-minute outline with a 35-second opening cannot pass as a finished video
when its scene timing covers only that opening. Structural checking cannot
judge whether a model has padded sparse text into a long scene; the media review
must listen for intelligible speech, complete narration and appropriate pacing.

The inspection returns `complete`, actionable `{code, field, detail}` issues,
and explicit `reviewRequired` checks. It checks source rights state/expiry and
asset provenance references, but cannot establish that an asserted permission
is true or that every natural-language claim is supported. The generation and
semantic review path must check claims against evidence and channel exclusions.

Asset `provenance.sourceIds` resolve only canonical `evidence.sourceId` values,
never evidence observation IDs. Imported material must preserve this distinction
so source revocation/invalidation targets the same underlying source.
An explicit revocation or expired/malformed consent timestamp blocks readiness.
Third-party sources require an active grant with `purpose: editorial`, a grant
ID and a valid future `consentExpiresAt`; a discovery-only grant does not authorize
editorial reuse. A known external origin retains these checks even when the
material was acquired through upload or labelled first-party access. Genuine
first-party sources do not require an external grant, but explicit revocation
or expiry is still honored.

Resolving a `mediaId` within the requesting organization, checking actual file
bytes/playability, reviewing typography, captions, rights and synthetic or
commercial disclosures remain separate acceptance checks. Synthetic media IDs
in tests prove only validation behavior.

## Publication boundary

Publication consumes the assembled shared material through the existing
provider-specific path. It must check actual account type, auth route, allowed
formats, consent, link surfaces and platform limits. A generic professional
Instagram account is not sufficient proof of Story or link-sticker support.
An unsupported interactive feature needs explicit manual completion; a drawn
sticker is not interactive functionality.

Threads must resume an ordered conversation from accepted provider parent IDs.
TikTok must retain creator-selected privacy, current creator data and explicit
upload consent. A campaign autopilot grant cannot replace these interactions.
Without a supported route, deliver a clear draft/export/manual continuation.
Only a provider receipt establishes external acceptance.

## Evidence and policy classification

Each rule carries a stable ID, versioned catalogue, source date, authority and
one of `requirement`, `recommendation`, or `experiment`. Product obligations are
labelled as product obligations. Editorial recipes and hypotheses do not become
platform constraints or promises of improved reach.

Official sources inspected on 3 November 2026:

- [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage): the existing
  plain-message route allows 4096 entity-parsed characters; the media caption
  route allows 1024. Rich formatting remains the existing formatter's job.
- [YouTube link surfaces](https://support.google.com/youtube/answer/13748639):
  Shorts description/comment URLs are non-clickable; long-video external links
  depend on advanced-feature access.
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/):
  creator controls, consent, preview and app promotional watermark constraints.

The official Meta documentation returned HTTP 429 and its Postman overview
timed out during this bounded check. The catalogue therefore does not assert
new account eligibility or hardcode carousel/media ceilings from native-app
features. Actual provider/account validation remains required.

The owner-supplied research packet informed the editorial structure, but its
examples are drafts. This implementation removes unsupported diagnostic
thresholds, unverified customer outcomes, fake photo placeholders, and the
assumption that a long-video opening plus outline is finished production.
Adapting permitted own content remains an editorial choice.

## Fictional evaluation coverage

`tests/social-factory.editorial-playbooks.test.cjs` contains original RU/EN
examples for three distinct briefs: B2B handoff advice, a local pottery studio
and a physical organizer concept. They explicitly identify fictional scenarios
and avoid invented ROI, bookings, prices, durability and sustainability claims.
They are structural evaluation inputs, not approved gold answers or live
customer content.

Checks cover incomplete carousel assets, exact Story frame counts, Telegram
length/continuation handling, ordered Threads replies, honest Shorts CTA
surfaces, incomplete long-video scene coverage, evidence expiry, source rights
and asset provenance. Provider, real-media and paid generation acceptance are
outside this focused suite.
