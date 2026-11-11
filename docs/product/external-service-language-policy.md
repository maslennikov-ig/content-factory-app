# External-service language policy

Status: decision. Owner instruction recorded on 7 November 2026.

## Rule

For every external service, write free-form instructions and operational settings
in English. This includes generation prompts, background/look descriptions,
camera/motion directions, performance instructions, style guidance and technical
explanations sent to a provider. Apply the same rule to HeyGen, Higgsfield,
image/audio/video services and future integrations.

Audience content retains its requested language: spoken script, narration,
subtitles, on-screen text, social posts and other final copy. Preserve proper
names, exact quotations, original recordings and source material when their
original form matters. Search queries may use the language needed to retrieve
the requested sources; they are retrieval content, not operational instructions.

Provider contracts take precedence over natural-language translation: field names,
enum values, model/voice/asset IDs, URLs, locale codes, numbers and booleans retain
their defined form. Do not translate a technical identifier or force the output
locale to English because the instructions are English.

| Purpose | Example | Language |
| --- | --- | --- |
| Motion direction | Look directly at the camera with a confident expression. | English |
| Background description | A modern business studio with warm lighting. | English |
| Requested Russian speech | Приглашаю вас на саммит в Дубае. | Russian |
| Requested Russian title/subtitle | Встретимся в Дубае | Russian |
| Provider locale | `ru-RU`, or another exact code required by that route | Provider contract |

## Preparation and approval

Compose or translate instructions before saving the reviewed provider request.
Keep their semantic intent, selected identity, assets and limits. Clearly
separate direction from public copy so a provider cannot read technical
instructions as narration or translate exact public text unintentionally.

Apply this to reusable profile defaults and per-video overrides alike. The
human-facing interface can explain those settings in Russian; the external
instruction stays English. A human decision about identity, voice or another
protected choice remains a human decision regardless of language or chat mode.

Do not translate or otherwise mutate an immutable approved payload during
dispatch, retry or recovery. Historical requests and evidence retain their
original bytes. A changed request follows the existing revision/admission path;
language normalization is not authority for another generation.

## Acceptance

- An English-direction request can produce Russian speech, captions and visible
  text without changing their requested language or exact approved copy.
- English output uses English content when requested; another output language
  is not replaced by English automatically.
- Exact provider keys/enums/IDs/locales and original source/audio are preserved.
- Both review and autopilot modes prepare the same language separation before
  their existing approval/grant checks. Recovery does not rewrite saved payloads.

This decision defines required behavior. It is not a claim that all existing
provider builders have already been audited or updated. Adoption belongs to the
existing integration tasks, including the HeyGen controls.
