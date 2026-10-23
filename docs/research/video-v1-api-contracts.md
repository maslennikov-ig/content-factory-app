# Video V1 adapter contracts

Checked against primary documentation on 2026-10-22. This is engineering evidence and a pilot proposal, not account access, accepted output quality, spend authority or a deployment receipt. No API key or paid request was used.

## Documented clip catalog

`HIGGSFIELD_ROUTES_V1` exports three explicit model IDs: `wan-3.0`, `kling-3.0-standard`, `kling-3.0-pro`. Evidence remains `documented` until account and sample verification. Each has text/image endpoints; V1 accepts one owned first-frame reference, never silently drops multiple references.

| Model | Endpoint prefix | Accepted settings |
| --- | --- | --- |
| Wan 3.0 | `/alibaba/wan-3.0` | Integer 2–30 seconds; explicit 480p/720p/1080p, ratio, `generate_audio`; `enable_thinking=false` |
| Kling Standard | `/kling-video/v3.0/std` | Integer 3–15 seconds; `sound=on/off`, `multi_shots=false`, `cfg_scale=0.5`; text endpoint accepts ratio |
| Kling Pro | `/kling-video/v3.0/pro` | Same V1 field subset; distinct route, no implicit upgrade |

Append `/text-to-video` or `/image-to-video`. Image endpoints use `image_url`. Kling image schemas expose neither ratio nor resolution; V1 checks the owned reference dimensions against the requested ratio and sends neither unsupported field. Wan image accepts an explicit ratio. Kling prompts over 2,500 characters reject before any request to avoid provider truncation. Locale is BCP-47 semantic intent for clips, never a promise of speech language. Clip captions are unsupported.

Sources: [Wan text](https://docs.higgsfield.ai/docs/models/wan-3/text-to-video), [Wan image](https://docs.higgsfield.ai/docs/models/wan-3/image-to-video), [Kling Standard text](https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video), [Standard image](https://docs.higgsfield.ai/docs/models/kling-3/standard-image-to-video), [Pro text](https://docs.higgsfield.ai/docs/models/kling-3/pro-text-to-video), [Pro image](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video).

Prepare calls the free authenticated `/estimate{generation-path}` with the exact generation body and stores its account USD quote, without treating it as a hard cap. Authorization is `Key key_id:key_secret`. Frozen prepared objects retain exact prompt, references and field choices. Root persists bytes/key before submit; signing a different reference URL changes the request and invalidates replay. [Billing and estimate](https://docs.higgsfield.ai/docs/concepts/billing-and-retention), [authentication](https://docs.higgsfield.ai/docs/authentication).

Higgsfield accepts a visible ASCII idempotency key, rejects same-key parameter mismatch with 422, and preserves the original request identity. Its current documentation does **not** specify a deduplication retention lifetime. Adapter submission performs one call; the durable job owns a single immediate replay of identical persisted endpoint/body/key after an ambiguous transport failure. An aged/orphaned submission remains uncertain; there is no inferred provider lifetime. [Idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency).

Receipts must contain the documented HTTPS API host and exact ID-bound status/cancel path. All fetches reject redirects, use 30-second request deadlines and sanitize errors. Poll maps documented terminal states; cost and duration stay unknown because this schema reports neither. Cancel 202 has no JSON body; the adapter checks status afterward and does not equate acceptance with confirmed cancellation. Output URL ingestion and DNS/redirect validation belong to the owned-media boundary. [Lifecycle and cancellation](https://docs.higgsfield.ai/docs/concepts/requests), [status schema](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status), [polling](https://docs.higgsfield.ai/docs/concepts/polling).

## Direct presenter

`HEYGEN_ROUTES_V1` exports `heygen-avatar`. V1 uses only `POST /v3/videos`, `type=avatar`, an explicit public account-visible look/voice, `engine.type=avatar_iii|avatar_iv`, exact `script`, `voice_settings.locale`, MP4, explicit 720p/1080p and ratio. Captions use provider `caption={file_format:srt,style:default}`. There is no target `duration` request field, silent engine default or script rewriting. Target lengths 15/30/60 seconds are editing targets. [Create video](https://developers.heygen.com/reference/create-video).

`listAssets(credential)` returns `{voices:[{id,name,language,supportLocale,speechEngines}],avatars:[{id,name,type,engines}]}` from free `/v3/voices?type=public` and `/v3/avatars/looks?ownership=public`, following bounded cursors. Only speech-available voices and eligible look engines are offered. Voice `speechEngines` are speech engines (`starfish`, `orca`, `elevenlabs`, `elevenlabs_v3`); avatar `engines` are rendering engines (`avatar_iii`, `avatar_iv`). These distinct provider enums must never be compared as though they describe the same setting. The public schema exposes no voice-to-avatar-renderer compatibility matrix. The requested BCP-47 primary language must match the voice's reported language; regional variants also require `support_locale`. Account visibility does not prove pronunciation quality. Private cloned voices, custom avatar creation and consent collection are outside V1. [Voice catalog](https://developers.heygen.com/reference/list-voices), [look catalog](https://developers.heygen.com/reference/list-avatar-looks).

Fresh schema clarification: current create-video OpenAPI documents `Idempotency-Key` replay within 24 hours, including slightly changed request bodies, with 409 while in flight. This differs from the earlier research snapshot. V1 sends the saved key as defense but deliberately keeps lost submit/5xx uncertain, with no automatic HeyGen submission replay. Root controls resolution. [Current create-video OpenAPI](https://developers.heygen.com/reference/create-video).

Single-video create/status responses are enveloped: `{data:{video_id:...}}` for creation and `{data:{id,status,video_url,duration,...}}` for status. The adapter validates and unwraps that object inside HeyGen only; paginated asset `data` arrays keep their separate contract. Independent review found the earlier flat create/status fixtures were wrong; those fixtures and adapter parsing were corrected together. [Create video](https://developers.heygen.com/reference/create-video), [Get video](https://developers.heygen.com/reference/get-video).

Status uses ID-bound `GET /v3/videos/{id}`. The adapter exposes only reported actual duration; actual cost remains unknown. Returned provider errors never echo script, credential or raw failure messages. No documented cancel operation is advertised. [Get video](https://developers.heygen.com/reference/get-video).

## Cost and bounded pilot proposal

The indicative HeyGen estimate uses the exact engine/avatar public rate multiplied by the user's target seconds, labelled `target-duration-only-not-a-hard-cap;account-price-unverified`. It supplies no upper bound and is not an invoice. Current USD/minute rates: Avatar IV Photo 2.31, Digital Twin/Studio 4.83; Avatar III Digital Twin 0.60, Studio/Photo 0.99. Actual generated seconds determine charges. Higgsfield account quotes are fetched for exact payloads; advertised starting rates do not price arbitrary routes. [HeyGen pricing](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained), [Higgsfield estimate](https://docs.higgsfield.ai/docs/concepts/billing-and-retention).

Proposed pilot only, requiring separate current spend authority: 20 submissions total, four per brief (raw/prepared, two attempts each), no paid fallback or resubmission beyond that count. Cases: Wan product-image motion 5s/720p; Kling Standard text 5s/audio; Kling Pro image 5s/audio off with matching owned reference; two stock-avatar presenter briefs around 30s in distinct account-supported locales using Avatar III Studio. Presenter public-rate target subtotal: 8 × 0.5 × $0.99 = **$3.96**, explicitly subject to actual duration/account pricing. Compute all 12 exact Higgsfield account quotes at preflight; proposed monetary authorization ceiling **$25 total**, with no launch when conservative remaining spend cannot be bounded or operator/account controls are missing. This ceiling is a proposal, never an assertion that the API enforces it. Do not infer a guaranteed presenter duration ceiling from this subtotal.

Before a paid pilot record account owner/payer, exact quotes, allowed assets/locale/engine, applicable API terms, provider spending controls and an approved cap. Otherwise engineering stays on fixtures. Record every paid attempt, observed billing or unknown cost, elapsed time, owned result, viewed quality and competent-speaker review. No account/catalog HTTP success or contract test establishes real quality or acceptance.

## Focused verification

`node --test tests/video-provider-v1.contract.test.cjs` (root-owned final run). Cases cover exact quote/submit payload, each clip image route, validation before network/spend, unchanged scripts, account assets/locale/engine, pagination, receipt URL fences, sanitized errors, lost submit with one call, provider states and cancellation request versus confirmed result. No real provider calls are part of these tests.
