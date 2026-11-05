# External video composition contracts — 3 November 2026

Source verification is documentation evidence, not account availability, paid-generation acceptance, or output-quality acceptance. No credentials were inspected or wired and no paid calls were made.

## Exact selected endpoints

- [HeyGen Studio guide](https://developers.heygen.com/studio-videos): `POST https://api.heygen.com/v3/videos`, `type: studio`, ordered whole-frame scenes; `GET /v3/videos/{video_id}`.
- [Create video reference](https://developers.heygen.com/reference/create-video) and [get video reference](https://developers.heygen.com/reference/get-video).
- [Hyperframes cloud guide](https://developers.heygen.com/hyperframes), [create render reference](https://developers.heygen.com/reference/create-hyperframes-render), [get render reference](https://developers.heygen.com/reference/get-hyperframes-render): `POST /v3/hyperframes/renders`, `GET /v3/hyperframes/renders/{render_id}`.
- [Official OpenAPI](https://developers.heygen.com/openapi/external-api.json), fetched directly: `info.version=1.0.0`; SHA-256 `7dfa5e59b4f51db9882f1028d527899e5fd86c3f5472e3e0b9860f1cac66afe1`. Relevant schemas: `CreateVideoFromStudio`, `AvatarVideoScene`, `StudioAvatarInput`, `ImageScene`, `VideoScene`, `CreateHyperframesRenderRequest`, `AssetBase64`, `VideoDetail`, `HyperframesRenderDetail`.

## Supported adapter subset

Studio sends explicit aspect ratio, 720p/1080p, and optional burned SRT captions. Its output container is fixed MP4: do **not** add `output_format` to Studio, whose schema forbids extra fields. Supported speaking scenes:

| Scene | Exact provider fields |
| --- | --- |
| Presenter | `type: avatar_video`; `input: {type: avatar, avatar_id, script, voice_id, voice_settings: {locale}, engine: {type: avatar_iv}}` |
| Narrated still | `type: image`; `source: {type: url, url}`; `script`, `voice_id`, `voice_settings: {locale}`; omit `duration` |
| Narrated video | Same narration fields; `type: video`; explicit `playback: {mode, mute: true}` |
| Approved existing clip | `type: video`; source URL; `playback: {mute: false, volume: 1}`; approved transcript retained in the input, not resynthesized |
| Silent still/clip | Still `duration`; clip `playback: {mute: true}` |

Studio automatic captions are documented for avatar and narrated-image scenes. The adapter rejects requested automatic captions for narrated-video scenes. A reused clip can carry provenance-backed `sourceCaptions: burned`; callers should request `captions: false` for final composition of already-captioned clips. Requested provider captions require `captioned_video_url`; ordinary `video_url` cannot silently satisfy that expectation. Studio scene framing descriptions disagree between guide passages and OpenAPI; no exact crop/pad guarantee is exposed.

[Usage limits](https://developers.heygen.com/docs/usage-limits): 50 scenes, scripts at most 5,000 characters, public source media, silent images at most 300 seconds. This port intentionally bounds total target duration to 600 seconds and every scene to 600 seconds. Synthesized speech duration is a target, not an enforceable runtime.

## Authored Hyperframes bundle

The adapter authors the ZIP; it never treats arbitrary source HTML as approved input. The exact request project is `{type: base64, media_type: application/zip, data: ZIP_BASE64}`, with `composition: index.html`, 1080p, 30 fps, standard quality, MP4, explicit aspect ratio. The small deterministic ZIP has one root file and fixed metadata; it requires no upload or local render farm.

The [official HTML schema](https://hyperframes.heygen.com/reference/html-schema) specifies root `data-composition-id`, `data-start`, dimensions, duration, and `data-no-timeline` for timeline-free content. Ordered clips, media and timed captions use declarative timing. Videos with retained sound declare `data-has-audio`; silent footage is muted. The provider owns media seeking and mixing. No playback JavaScript, remote scripts/fonts, variable code, or untrusted markup is authored. Text and attributes are escaped, media uses checked public HTTPS host syntax, and CSP restricts media to exact source origins. These syntax checks do not establish source ownership, media integrity, or DNS ownership; the durable domain must admit owned assets. Hyperframes does not synthesize narration in this adapter: exact approved narration must already exist as owned audio or an owned speaking clip. Approved ambient clips can retain their original audio without a fabricated transcript. Requested new captions require supplied bounded timed cues matching the approved transcript.

## Price and recovery

[Live API pricing](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-credits-explained), last-updated label 28 October 2026, states Hyperframes 1080p/30 fps at **$0.15 per output minute**. A stale search result showed $0.10 and was rejected in favor of the opened current page. `estimateHyperframesV1` applies $0.15 to authored duration; source marks public tariff, account unverified, no hard cap. Studio composition/export and its image/video narration tariff are not established by the available pricing table, so its estimate remains null. No detail schema documents actual charged USD; neither adapter turns estimates or arbitrary response `cost` fields into actual cost.

Prepared requests retain immutable input, body and canonical JSON digests (stable across JSONB object-key ordering), intent, payer and credential reference. Restored requests are recompiled and checked before submission; changing payer or credential reference is rejected. Read-only pinned receipt polling remains available after spending is disabled; new prepare/submit still require positive funding limits. All network operations have timeouts and bounded response reads. Polling is one call, not an internal loop. The download helper requires an explicit trusted-host list and byte cap, rejects redirects, forwards no auth, and checks MIME plus MP4 signature; signature is not playback acceptance.

Current endpoint references document 24-hour idempotency replay, including Studio. This implementation deliberately keeps both paid creates at one attempt: a lost, oversized, malformed or receipt-less successful response remains uncertain with zero automatic replay. The durable job must reconcile. Provider errors are sanitized. Download URLs are presigned and expiring; import promptly and refresh by polling the retained receipt.

## Focused evidence and remaining gates

- Node 22.23.2 / pnpm 10.6.1: `pnpm exec node --test tests/video-composition-providers.test.cjs` — 14/14 passed.
- Strict targeted TypeScript check of the five composition modules — passed.
- ZIP interoperability/CRC verified by Python `zipfile` in the behavioral tests; tests cover exact scene order/script/locale/settings/auth, payer integrity, unsupported inputs, lost/malformed creates, status normalization, and bounded credential-free download.
- No full build/suite was run by this isolated adapter stream. Parent owns integrated acceptance.
- Real account entitlement, tariff/funding admission, provider execution of the authored CSP/schema, playable media, RU/EN voice quality, intelligibility, captions, continuity, latency, actual costs and selective-revision pilot remain unverified. Documentation does not close those gates.

### Browser CSP compatibility follow-up

The official source at commit `a5a61213320c523875633a94ef96097456269136` establishes three renderer requirements:

- [Engine frame transport](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/engine/src/services/videoFrameTransport.ts#L26) serves decoded video frames at same-origin `/__hyperframes_video_frames__/…` URLs.
- [Engine metadata hints](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/engine/src/services/frameCapture.ts#L2610) assign a `data:image/svg+xml` video poster and await native `Image.decode()`.
- [Producer compiler](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/producer/src/services/htmlCompiler.ts#L2143) localizes remote audio, video and images to its own file server.

The emitted CSP allows image `'self'` and `data:`, and media `'self'`, alongside the exact approved remote origins. The additional trusted runtime-script requirement is covered by the full-engine follow-up below; frame policy remains closed.

An opt-in real Chromium regression reproduces failed frame/poster/audio/video decoding under the former CSP, then proves native decoding succeeds with the generated fixed policy: PNG frame 1×1, SVG poster 12×8, localized video 16×16, localized audio, and approved remote image. Unapproved image/media origins, external/data/eval scripts and iframe still fail under browser-enforced CSP. Trusted runtime inline scripts execute, while source text containing script markup remains literal and creates no script nodes. This test uses a local HTTP fixture and a tiny FFmpeg codec fixture; it does not call HeyGen or install a production renderer. Enable with `CF_VIDEO_COMPOSITION_BROWSER_REGRESSION=1` and, when needed, `CF_VIDEO_COMPOSITION_PLAYWRIGHT_MODULE=/path/to/playwright`.

The affected authored-bundle and browser checks passed **2/2** on Node 22.23.2; unchanged adapter checks retain the prior passing evidence. A cloud-provider render remains an external acceptance gate.


### Full official runtime follow-up

The image/media check alone did not establish runtime readiness. The [official producer file server](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/producer/src/services/fileServer.ts#L779) inserts verified runtime and bridge source using the [compiler's plain inline script tags](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/core/src/compiler/htmlDocument.ts#L210). No nonce propagation or CSP hash option exists in those injection paths. The runtime/bridge source is produced after the submitted source bundle, so an author-time hash would not describe the eventual cloud script. A full local official render reproduced blocked scripts, `seek=false`, `player=false`, and readiness failure under `script-src 'self'`.

The smallest compatible policy allows trusted renderer-inserted inline scripts: `script-src 'self' 'unsafe-inline'`. This is limited to our generated, escaped document, not arbitrary submitted HTML or code. External, data-URL and eval scripts remain forbidden; iframe, object, base and form restrictions remain. The [compiler's deterministic-font pipeline](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/packages/core/src/fonts/deterministicFonts.ts#L1468) also emits data-URL WOFF2 fonts, observed blocked in the first full render, so fonts allow only `'self' data:`. Text, title, URLs and caption source strings continue to be escaped rather than executed.

The official `@hyperframes/producer` 0.9.9 and its matching core/engine dependencies were installed only in `/tmp/cf-hyperframes-runtime.HXIveN`; [the source project's Apache-2.0 licence](https://github.com/heygen-com/hyperframes/blob/a5a61213320c523875633a94ef96097456269136/LICENSE) was checked. No SDK/source was vendored and no production renderer or dependency was added. The opt-in full-engine test uses task-private render/font/cache directories and closes its server/browser.

Full evidence: **16/16 focused tests passed, zero skipped**, with both browser and engine flags enabled. The full official compile → injected runtime → capture → encode → assemble produced a real H.264 MP4: 1920×1080, five frames, 1.000 seconds. FFprobe validated the file; FFmpeg verified different decoded first/second scene pixels. A second official runtime/capture session reported working `__hf.seek`, duration 1, exact literal source title/heading, and zero injected source script nodes. The first failing render and final artifact/log are retained under the task-private runtime directory. This establishes the tested local OSS version; the deployed HeyGen cloud version and paid output remain unverified.

Reproduction (existing Node 22.23.2, pnpm 10.6.1, Chrome, FFmpeg and task-private SDK):

```bash
CF_VIDEO_COMPOSITION_BROWSER_REGRESSION=1 \
CF_VIDEO_COMPOSITION_ENGINE_REGRESSION=1 \
CF_VIDEO_COMPOSITION_PLAYWRIGHT_MODULE=/path/to/playwright \
CF_VIDEO_COMPOSITION_HYPERFRAMES_MODULE=/path/to/@hyperframes/producer/dist/index.js \
CF_VIDEO_COMPOSITION_CHROME=/path/to/chrome-headless-shell \
CF_VIDEO_COMPOSITION_FONT_CACHE=/path/to/existing/public-font-cache \
pnpm exec node --test tests/video-composition-providers.test.cjs
```
