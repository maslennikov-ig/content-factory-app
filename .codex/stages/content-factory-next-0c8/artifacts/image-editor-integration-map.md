---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-0c8/stage-manifest.json
stream_owner: subagent:image-editor-integration-map
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root-orchestrator
public_facade: media-library image edit and upload round-trip
bounded_acceptance: an existing image can enter a client-only editor, export through the same-origin media upload endpoint, and become an ordinary selectable media item
non_goals:
  - candidate-selection-or-package-install
  - product-implementation
  - backend-schema-or-upload-contract-change
  - browser-network-or-live-service-call
evidence:
  - current-graphify-report-and-focused-queries
  - exact-current-source-inspection
task_id: content-factory-next-0c8.image-editor-integration-map
stage_id: content-factory-next-0c8
repo: content-factory-next
branch: codex/image-editor
base_branch: codex/content-intelligence-evidence-repair
base_commit: 8d6e85e64a99cf329dda1f87fa18a4e07ced3ef0
worktree: /tmp/cf-vme2
write_zone:
  - .codex/stages/content-factory-next-0c8/artifacts/image-editor-integration-map.md
selected_skills: []
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the mapping event; no runtime, package, browser, server or temporary workspace was created.
risk_level: high
risk_tags:
  - untrusted-media
  - browser-memory
  - cross-origin-canvas
  - upload-shape
  - accessibility
  - third-party-network
affected_surfaces:
  - media-library
  - post-composer-media-picker
  - client-image-editor
  - media-upload
invariants:
  - original-media-is-never-overwritten
  - editor-browser-calls-only-same-origin-and-the-exact-selected-source-url
  - saved-output-is-a-new-tenant-owned-media-row
  - post-state-receives-only-validated-id-and-path
  - standalone-media-library-never-mutates-launch-state
verification:
  - read-only mapping; no product test was run
changed_files:
  - .codex/stages/content-factory-next-0c8/artifacts/image-editor-integration-map.md
explicit_defers:
  - foundation-selection-and-external-evidence
  - executable-red-contracts
  - implementation-and-browser-proof
---

# Summary

The smallest safe integration seam is the existing image card inside
`MediaBox`: open one library-neutral client editor, upload its raster through
same-origin `POST /media/upload-simple`, then refresh only in standalone mode
or refresh and select the new item in post-picker mode. The detailed map below
separates definitive current paths from proposed adapter boundaries.

# Integration decision

The smallest safe seam is **inside `MediaBox`, on each image card**, with an
additive `ImageEditorModal` that receives one complete media record and returns
one newly uploaded media record. It serves both consumers without coupling the
editor to the launch store:

- `/media` renders `MediaBox(standalone=true)`: a successful edit refreshes SWR
  only; it does not select or attach anything.
- the post composer renders `MediaBox(standalone=false)`: a successful edit
  refreshes SWR and appends the returned item to `selected`; the existing “Add
  selected media” action then carries it through the existing callback into the
  launch store.

Do not put the editor in `useLaunchStore`, `MultiMediaComponent`, Uppy, a new
backend service, or a library-specific modal. Keep the selected foundation
behind an adapter in `components/media/image-editor/**`. This makes the
research choice replaceable and keeps rollback additive.

# Primary owning path

## 1. Entry and source selection (definitive)

1. The standalone route
   `apps/frontend/src/app/(app)/(site)/media/page.tsx:9` renders
   `MediaLayoutComponent`, which renders
   `MediaBox(setMedia=noop, standalone=true)` at
   `apps/frontend/src/components/new-layout/layout.media.component.tsx:5-9`.
2. The post composer renders `MultiMediaComponent` from `Editor` at
   `apps/frontend/src/components/new-launch/editor.tsx:1153-1162`. Its
   “Insert media” action opens a full-screen modal and renders `MediaBox` at
   `apps/frontend/src/components/media/media.component.tsx:716-727`.
3. `MediaBox.loadMedia` calls same-origin `GET /media?page=N&search=...` and SWR
   stores `{pages, results}`
   (`media.component.tsx:219-229`). Each result is rendered as an image or video
   card at `media.component.tsx:528-599`.
4. Add a real `<Button type="button">` edit action to image cards only. The
   action must stop propagation so it does not toggle card selection. Pass the
   complete list result, not just `{id,path}`, because filename/alt metadata is
   useful for export naming and accessible labels.

Input shape returned by `GET /media` is definitive from
`MediaRepository.getMedia` (`libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts:69-111`):

```ts
type MediaLibraryItem = {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
  thumbnailTimestamp: number | null;
};
```

The source URL is currently unchanged by `useMediaDirectory().set(path)`
(`libraries/react-shared-libraries/src/helpers/use.media.directory.ts:2-8`).
Therefore the editor must treat `path` as untrusted input, fetch **only that
exact URL**, require an image response and a successful CORS-readable body,
decode it into a Blob/Object URL or `ImageBitmap`, and never accept a redirect
or URL invented by the editor foundation. A data/blob URL produced locally is
also safe. Cross-origin storage without usable CORS is an explicit recoverable
error, not a reason to draw a tainted image and discover the failure at save.

## 2. Modal and client editor (definitive shell, proposed adapter seam)

`useModals.openModal` accepts full-screen children as a function of `close`
(`apps/frontend/src/components/layout/new-modal.tsx:19-37, 49-66, 75-95,
116-120`). Open the editor as the top nested modal and pass its supplied
`close` callback directly. Do not depend on `closeCurrent` from inside a
`removeLayout` modal: the `removeLayout` branch is not wrapped in
`CurrentModalContext` (`new-modal.tsx:132-165`).

The library-neutral boundary should be no broader than:

```ts
type RasterFormat = 'image/png' | 'image/jpeg';
type SocialPreset = 'square' | 'portrait' | 'story';

interface ImageEditorEngineAdapter {
  mount(host: HTMLElement, source: DecodedImage, options: EditorBounds): void;
  apply(command: EditorCommand): void;
  getSnapshot(): EditorSnapshot;       // dimensions, layers, selection, history state
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  exportRaster(options: { format: RasterFormat; quality?: number }): Promise<Blob>;
  dispose(): void;
}

type ImageEditorModalProps = {
  source: MediaLibraryItem;
  createEngine: () => ImageEditorEngineAdapter;
  upload: (blob: Blob, filename: string) => Promise<UploadedMedia>;
  onSaved: (media: UploadedMedia) => void;
  onClose: () => void;
};
```

`EditorCommand` must cover crop, resize, rotate, horizontal/vertical flip, add
and edit text, add shape, start/end drawing stroke, select/move/delete layer,
raise/lower/front/back layer, apply social preset, undo and redo. UI state,
validation and upload stay outside the foundation adapter; geometry and raster
export stay behind it. No adapter method may accept a stock provider, remote
font URL, API key, telemetry sink or vendor asset URL.

## 3. Export and persistence (definitive existing boundary)

Use the existing same-origin endpoint directly, not the deployment-dependent
Uppy transport:

```ts
const body = new FormData();
body.append('file', blob, filename); // edited-<source stem>.png|jpg
const response = await fetch('/media/upload-simple', { method: 'POST', body });
```

Use the repository `useFetch` wrapper, which deliberately omits a JSON
`Content-Type` for `FormData` and preserves credentials/tenant headers
(`libraries/helpers/src/utils/custom.fetch.func.ts:48-76`). This endpoint is
already exercised with a Blob by `MediaComponentInner`
(`apps/frontend/src/components/launches/helpers/media.settings.component.tsx:334-348`).

The backend path is:

1. `MediaController.uploadSimple` at
   `apps/backend/src/api/routes/media.controller.ts:111-133` resolves the
   organization from the authenticated request.
2. `FileInterceptor('file')` parses the multipart body.
3. `CustomFileValidationPipe` detects bytes rather than trusting the supplied
   MIME, permits supported image formats, enforces **10 MiB** for images, and
   sanitizes the name
   (`libraries/nestjs-libraries/src/upload/custom.upload.validation.ts:9-18,
   21-67`). This is stricter than the Uppy client’s 30 MiB image check.
4. `UploadFactory` writes the object, then `MediaService.saveFile` delegates to
   `MediaRepository.saveFile` (`media.controller.ts:122-132`,
   `media.service.ts:59-65`).
5. Prisma creates a new organization-owned `Media` row and selects
   `{id,name,originalName,path,thumbnail,alt}`
   (`media.repository.ts:8-30`). No existing row is updated.

Validate `response.ok`, JSON structure, non-empty `id` and `path` before
closing. The exact upload result is:

```ts
type UploadedMedia = {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
};
```

Why not `useUppyUploader`: it chooses Transloadit whenever configured and, for
Cloudflare, performs browser-side multipart calls through provider-specific
URLs (`apps/frontend/src/components/media/new.uploader.tsx:170-185` and
`libraries/react-shared-libraries/src/helpers/uppy.upload.ts:22-96`). Those
branches are useful for generic uploads but cannot prove the editor’s
same-origin-only browser contract. `POST /media/upload-simple` gives one stable
same-origin browser boundary while retaining the existing server storage
abstraction.

## 4. Return to media library and post selection (definitive)

After validated upload:

1. Always call `mutate()` on the `MediaBox` SWR resource so `/media` shows the
   new row (`media.component.tsx:226-229`).
2. If `standalone`, show success and stop. `MediaBox` deliberately disables
   selection in this branch (`media.component.tsx:256-260`) and generic upload
   completion already only refreshes (`media.component.tsx:243-250`).
3. If not standalone, append the full uploaded item to `selected`, de-duplicated
   by `id`. Keep the media-library modal open so the user can review the result.
4. On “Add selected media”, existing `addMedia` calls `setMedia(selected)` and
   closes the media modal (`media.component.tsx:271-278, 609-625`).
5. `MultiMediaComponent.changeMedia` appends the array and emits
   `onChange({target:{name,value}})` (`media.component.tsx:692-715`). `Editor`
   unwraps `target.value` and calls its `setImages` callback
   (`apps/frontend/src/components/new-launch/editor.tsx:1242-1244`). The parent
   resolves that callback to `setGlobalValueMedia` or `setInternalValueMedia`
   (`editor.tsx:595-604`), which writes the item array into the selected launch
   value (`store.ts:951-974`). The durable post-facing shape is only
   `{id,path}` plus optional thumbnail (`store.ts:11-17`).

# Feature-floor vertical slice

All eight items fit behind one editor session without another backend:

| Floor | Smallest complete behavior | Adapter/UI ownership |
|---|---|---|
| 1. Existing image + PNG/JPEG save | Open an image-card edit action; decode exact selected source; export chosen PNG/JPEG; upload as a new media row; refresh/select it | loader + adapter export + upload helper |
| 2. Crop/resize/rotate/flip | Numeric width/height with aspect lock, crop mode with apply/cancel, 90-degree rotate, horizontal/vertical flip | commands; visible invalid-size errors |
| 3. Cyrillic text | Add/edit text; Geologica and JetBrains Mono only; color, size, alignment; wait for `document.fonts.ready` before export | bundled fonts from `apps/frontend/src/styles/fonts.ts:1-52`; no font picker URL |
| 4. Shapes/drawing | Rectangle, ellipse and line plus one freehand pen with color/width | commands; one history entry per completed stroke |
| 5. Layers | Select, drag/move, delete, raise/lower/front/back; labelled layer list | adapter scene model + semantic buttons/list |
| 6. Social presets | Square 1080×1080, portrait 1080×1350, story 1080×1920; applying a preset is an undoable canvas resize, not a vendor template fetch | local constant table |
| 7. Undo/redo | Buttons and `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`; coalesce drag/stroke/text bursts | bounded command history |
| 8. Client-only/no vendor call | Client engine, bundled source and fonts, exact selected media read, same-origin upload only | adapter contract + browser request proof |

The editor starts from an existing image, which is the hard acceptance path.
A blank-canvas “Create image” entry is optional for this slice; presets remain
useful when resizing an existing source and can later seed a blank canvas
without changing the adapter.

# Safety, failure and performance bounds

These are recommended executable constants, not guesses delegated to a chosen
library:

- accept PNG/JPEG/WebP input for editing; reject GIF/video/AVIF/BMP/TIFF in the
  editor even though the generic upload endpoint supports more formats;
- encoded input at most 10 MiB, longest edge at most 8192 px, and at most
  20,000,000 decoded pixels; inspect dimensions before mounting a canvas;
- canvas output dimensions 64–4096 px per edge and at most 16,777,216 pixels;
- export Blob at most 10 MiB (the server’s real bound); keep the editor open if
  the selected format/quality exceeds it;
- at most 100 user layers, 2,000 characters per text layer, and 50,000 points
  across freehand strokes;
- 50 undo entries; store scene commands/object state, never duplicate the
  background bitmap; coalesce pointer movement into one entry per gesture and
  text edits into one entry per focus/short debounce group;
- use one active decode/export `AbortController`; revoke Object URLs, detach
  listeners and call `adapter.dispose()` on close/remount.

Failure states must be visible and recoverable: source loading, unsupported
type, oversized bytes, oversized decoded dimensions, corrupt/decode failure,
CORS/redirect/tainted source, font load failure, editor initialization failure,
exporting, export too large, upload failure, malformed upload response and
success. A failure never deletes or updates the source row, never closes the
editor, and never inserts a partial item into `selected`. Disable repeated save
while exporting/uploading. Abort is not reported as an error after deliberate
close.

Storage upload followed by DB insertion is not transactional; if Prisma insert
fails after object upload, the existing backend can leave an orphan object.
This is pre-existing behavior in `uploadSimple`, not a reason to widen this UI
stage, but the client must not claim success without a valid media response.

# Keyboard, focus and responsive contract

The shared modal manager closes on Escape but does not provide `role=dialog`,
`aria-modal`, a focus trap, focus restoration, or a labelled close button
(`new-modal.tsx:168-255`). Therefore the editor shell must own these semantics
for this stage rather than claiming the inherited wrapper supplies them:

- render a labelled `role="dialog" aria-modal="true"`; focus the heading or
  first toolbar control on open; trap Tab/Shift+Tab; restore focus to the exact
  edit trigger on close;
- Escape first exits crop/draw/text edit mode; if no mode is active and there
  are unsaved changes, open a discard decision; otherwise close;
- all tools are shared Buttons/choice primitives with visible focus; no
  click-only `<div>`, hover-only action or hand-written ARIA selection role;
- shortcuts never fire from text/number inputs except undo/redo; Delete removes
  a selected layer only when canvas/layer list owns focus;
- announce mode changes, recoverable errors and save success through a polite
  live region; upload failures use an alert; disabled tools retain an
  explanation;
- toolbar and properties panel stack below/above the canvas at 390/768 px,
  become side panels at 1024/1440 px, never horizontally overflow, retain 44 px
  mobile targets, work at 200% zoom and respect reduced motion.

Use only `cf` colors and the nine typography tokens. `cf-label-sm`/`cf-caption`
remain monospace. New files cannot rely on the legacy allowlists that currently
cover `media.component.tsx`; `docs/design/component-authoring-rules.md` and the
design guards are the boundary.

# Review route and browser network proof

Add an offline synthetic route under
`apps/frontend/src/app/(stand)/interface-review/image-editor/[scene]/page.tsx`
with a sibling scene component in the editor directory. Use
`defineInterfaceReviewScene`, `resolveInterfaceReviewContext` and
`InterfaceReviewFrame`. The common matrix is defined at
`apps/frontend/src/components/interface-review/fixture-contract.tsx:3-29` and
already enforces `connect-src 'none'`, self/data images and self fonts at
`fixture-contract.tsx:43-57`.

The route should use a data-URL or same-origin synthetic source and an injected
in-memory upload adapter; review fixtures are data-only and persistence-disabled.
Scenes should cover at least default, selected, loading, success, error,
disabled and long-content in light/dark, RU/EN and 1440/1024/768/390. Production
logic, not a look-alike, must render the shell and tool controls.

Browser proof must additionally record every request. Permit only the local
origin, Next static chunks and the two bundled font assets; fail on every other
origin and assert zero attempted vendor/telemetry/font/stock requests. CSP is a
second defense, not a substitute for request accounting. Exercise: source
load, Cyrillic text `Привет, мир`, each transform, shapes/drawing, layer reorder
and delete, preset, undo/redo, export callback, keyboard trap/return focus,
390/768/1024/1440, both themes, RU/EN, 200% zoom and no horizontal overflow.

# Recommended implementation write zone

The manifest’s implementation zone is sufficient if used narrowly:

- `apps/frontend/src/components/media/image-editor/**`
  - `types.ts`: media/output/command/adapter contracts and validators
  - `bounds.ts`: MIME/dimension/layer/history limits
  - `source-loader.ts`: exact-URL fetch/decode/abort/Object URL lifecycle
  - `upload-edited-media.ts`: `POST /media/upload-simple` and response validation
  - `editor-session.ts`: history and mode reducer independent of React/library
  - `engine-adapter.ts`: selected-foundation implementation only
  - `image-editor-modal.tsx`: accessible shell, state machine and controls
  - `image-editor.review-scene.tsx`: production shell with synthetic adapters
- `apps/frontend/src/components/media/media.component.tsx`: image-card edit
  trigger and the two-branch `onSaved` callback only
- `apps/frontend/src/app/(stand)/interface-review/image-editor/**`: offline
  review route only
- `tests/image-editor*.test.cjs`: contracts and render/integration tests
- `package.json`, `pnpm-lock.yaml`: selected candidate only after research

No backend, Prisma, `new.uploader.tsx`, `uppy.upload.ts`, launch store or
composer edit is needed. `DesignMediaIcon` already exists at
`apps/frontend/src/components/ui/icons/index.tsx:720-750`; reuse it instead of
adding a new icon. If new tool icons are required, keep them as local
`currentColor` components in `image-editor/**` unless the root explicitly
widens ownership to the actual shared icon location.

# Test matrix

| Layer | RED/GREEN proof | Exact target |
|---|---|---|
| Pure contracts | all commands and three presets; bounds; history cap/coalescing; MIME/URL/result validators; original snapshot unchanged | `tests/image-editor.contract.test.cjs` against exported production helpers |
| Upload adapter | one `POST /media/upload-simple`, `FormData` file/name, no manual content type, valid result reduced to `{id,path}`; non-2xx/malformed/abort fail closed | `tests/image-editor.upload.test.cjs` with mocked `useFetch`-compatible function |
| Media integration | edit action only for images; stop propagation; standalone calls mutate only; picker calls mutate + selects once; final callback keeps existing array shape | `tests/image-editor.media-roundtrip.test.cjs` rendering production `MediaBox` seams with deterministic mocks |
| Engine conformance | every selected-foundation adapter command changes snapshot/export; dispose removes listeners/resources; no vendor configuration surface | `tests/image-editor.engine.test.cjs` |
| Cyrillic raster | load bundled font, render `Привет, мир`, export PNG/JPEG, decode and assert non-empty deterministic glyph region and dimensions | real Chromium, plus retained raster evidence |
| Review route | valid/invalid query, frozen synthetic fixture, real component, persistence disabled, all required states | `tests/image-editor.interface-review.test.cjs` following existing interface-review tests |
| Design/accessibility | no raw roles/controls, tokens, typography, contrast, light/dark; dialog name, focus trap/return, shortcuts, live status | new test plus existing `choice-control`, `raw-control`, `design.guard`, `design.typography`, `design.contrast`, `foundation` suites |
| Browser | features, errors, responsiveness, zoom, reduced motion, keyboard, network request ledger, no overflow | Playwright against the local review route; retain screenshots/JSON/request manifest under stage evidence |
| Existing upload boundary | controller route/pipe/repository response projection remains present; no backend edit | focused source contract or existing upload/security tests; do not fake a new endpoint |

# Highest-risk branch points

1. **Must-fix — same-origin proof versus Uppy provider branches.** Reusing
   `useUppyUploader` would allow Transloadit or direct Cloudflare browser IO.
   Use `/media/upload-simple`. Expected value: a stable privacy boundary.
   Tradeoff: editor exports do not get generic Uppy progress/retry UI.
   Confidence: high.
2. **Must-fix — standalone versus picker completion.** Selecting an edited item
   in standalone mode would incorrectly couple `/media` to launch state; failing
   to select it in picker mode would break the post round-trip. Branch only in
   `MediaBox.onSaved`. Confidence: high.
3. **Must-fix — tainted/cross-origin canvas.** A normal `<img>` can display a
   path that canvas cannot safely export. Fetch and decode the exact path before
   mounting; fail visibly on opaque/CORS/redirect/decode results. Confidence:
   high; exact deployed storage CORS is unknown.
4. **Must-fix — 10 MiB server limit.** The uploader’s 30 MiB UI limit is not the
   controller pipe’s actual image limit. Bound export to 10 MiB and retain the
   editor on rejection. Confidence: high.
5. **High-value improvement — normalize `showMediaBox` callback typing.** The
   emitter declares a single `{id,path}` at `media.component.tsx:197-200`, while
   `MediaBox` always sends an array at `:204-205, :271-277`; two consumers treat
   it as a single object (`settings.component.tsx:75-78` and
   `bot.picture.tsx:43-46`). This is pre-existing and outside the smallest editor
   path, but any new use should avoid the emitter until root assigns a bounded
   correction. Confidence: high.
6. **High-value improvement — modal accessibility is not inherited.** The
   existing wrapper handles stacking/Escape/body locking but not dialog/focus
   semantics. The editor shell must supply them, and nested modal close must use
   the provided callback. Confidence: high.
7. **High-value improvement — history/resource exhaustion.** Libraries often
   snapshot whole canvases by default. Enforce the bounds above in the product
   session even if the foundation offers unbounded history. Confidence: medium
   until candidate adapter behavior is measured.

# Unknowns and fastest checks

| Unknown | Why confidence drops | Fastest next check |
|---|---|---|
| Which foundation satisfies adapter methods without vendor calls | deliberately outside this local stream | apply research artifact’s selected candidate, then inspect its package entrypoints and run the adapter/network conformance test before implementation |
| Whether deployed Cloudflare media paths allow a CORS-readable GET | repository stores arbitrary paths and no bucket CORS policy is versioned here | use a local storage fixture for acceptance; separately inspect deployment-owned bucket CORS with explicit authority, or document cross-origin source as a visible unsupported state |
| Actual raster memory/history behavior of the selected foundation | depends on scene implementation | create a 20 MP local fixture, 50 command entries and 100 layers in Chromium; measure responsiveness and heap without external calls |
| Whether the selected foundation exports after `next/font` completes | canvas engines vary in font resolution | wait for `document.fonts.load`/`ready`, render the Cyrillic browser proof, decode the raster and compare a retained glyph-region artifact |
| Whether all required tool icons exist in a compliant shared location | only the old `DesignMediaIcon` is confirmed | after candidate/UI controls are fixed, enumerate needed actions and prefer text-labelled local `currentColor` SVGs; do not widen shared icon ownership speculatively |

# Rollback

Remove the image-card edit trigger and `components/media/image-editor/**`, the
offline review route, tests, chosen package and lockfile delta. There is no
schema or existing workflow change. Images already exported remain ordinary
tenant media rows and are intentionally not deleted. The original source image
was never overwritten, so rollback has no data repair step.

# Mapping confidence

- Graph orientation used the current `graphify-out/GRAPH_REPORT.md` (built from
  `2598bb71`) and focused queries for `MediaBox`, `useModals`, Uppy/upload and
  interface-review/CSP. Because the graph predates this stream’s current commit,
  every cited owning file and symbol above was confirmed in the current tree at
  base commit `8d6e85e64a99cf329dda1f87fa18a4e07ced3ef0`.
- Entry, upload, repository projection and launch-store transitions are
  definitive current paths.
- The adapter modules, limits, responsive layout and tests are recommended
  integration boundaries; exact engine calls remain unknown until research
  selects the candidate.

# Verification

Read-only verification used the current Graphify report and focused queries,
then confirmed every cited entry point, callback, modal branch, upload endpoint,
validation pipe, repository projection, review contract, font and launch-store
transition in the current tree. `git diff --check` passed for this artifact. No
product code, package, browser, external service or runtime was changed or run.

# Risks / Follow-ups

Root must register this returned artifact in the owning stage manifest before
artifact validation can be fully green. Candidate selection, executable RED
contracts, adapter implementation, Cyrillic raster proof and browser network
accounting remain intentionally assigned to later stage streams. The material
pre-implementation blockers are deployed object-storage CORS behavior and the
selected foundation's bounded history/export behavior; their fastest checks are
listed above.
