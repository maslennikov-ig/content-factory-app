---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-0c8/stage-manifest.json
stream_owner: subagent:image-editor-implementation
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root-orchestrator
public_facade: media-library image edit and same-origin upload round-trip
bounded_acceptance: an existing PNG, JPEG, or WebP media item opens in a private client editor, supports the accepted editing floor, and saves a new PNG or JPEG media item without overwriting the source
non_goals:
  - backend-schema-or-upload-contract-change
  - uppy-transloadit-or-cloudflare-upload
  - third-party-editor-stock-font-or-telemetry-network
  - live-backend-persistence-or-production-delivery
evidence:
  - initial-browser-matrix
  - same-origin-request-ledger
  - correction-real-engine-flow
  - retained-cyrillic-raster
  - final-correction-state-integrity
task_id: content-factory-next-0c8.image-editor-implementation
stage_id: content-factory-next-0c8
repo: content-factory-next
branch: codex/image-editor
base_branch: codex/content-intelligence-evidence-repair
base_commit: 8d6e85e64a99cf329dda1f87fa18a4e07ced3ef0
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/components/media/image-editor/**
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/image-editor/**
  - tests/image-editor*.test.cjs
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/**
  - .codex/stages/content-factory-next-0c8/artifacts/image-editor-implementation.md
  - package.json
  - pnpm-lock.yaml
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - impeccable
  - playwright
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Disposable dev/production servers and Playwright sessions are closed; local browser/session/download/config outputs were moved to the system trash. Independent correction review found no remaining P0/P1/P2 and root accepted the stream.
risk_level: high
risk_tags:
  - untrusted-media
  - browser-memory
  - canvas-export
  - third-party-network
  - upload-shape
  - accessibility
affected_surfaces:
  - media-library
  - post-composer-media-picker
  - client-image-editor
  - media-upload
  - interface-review
invariants:
  - original-media-is-never-overwritten
  - exact-selected-source-only
  - no-editor-vendor-stock-remote-font-or-telemetry-call
  - direct-same-origin-upload-simple-only
  - standalone-mutates-swr-only
  - picker-selects-the-validated-returned-media-once
  - successful-upload-is-never-retried-after-refresh-failure
  - failed-or-partial-upload-keeps-editor-open
  - resource-history-and-layer-limits-remain-bounded
verification:
  - 'TDD RED: initial image-editor contracts failed 14/14 before the modules, route, and exact Fabric pin existed'
  - 'TDD RED: source response validation failed 1/13 before exact redirect, URL, response type, and MIME checks existed'
  - 'TDD RED: explicit text/drawing controls and the Fabric upper-canvas visibility regression each failed before their fixes'
  - 'FOCUSED GREEN: 7 suites, 94 tests passed (image-editor contracts/review plus design guard, contrast, typography, foundation, and choice-control contracts)'
  - 'TYPECHECK: pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --pretty false passed'
  - 'BUILD: pnpm --filter content-factory-frontend build passed with Next 16.2.6; the Fabric engine dynamic client chunk was emitted'
  - 'BROWSER: all eight review states returned 200; invalid scene returned 404; 390 and 1440 light/dark RU/EN proofs have zero horizontal overflow'
  - 'ROUNDTRIP: Cyrillic JetBrains Mono text, rectangle/rotation, portrait preset, keyboard undo/redo, freehand layer, and PNG export produced new review-edited media (55,056 bytes) while review-source remained unchanged'
  - 'NETWORK: 13 same-origin resources, zero external/editor-vendor/stock/telemetry/remote-font resources'
  - 'ACCESSIBILITY: labelled modal, initial heading focus, forward/reverse focus wrap, dirty Escape alertdialog, 200% zoom, reduced-motion preference, polite status and error alert verified'
  - 'PACKAGE: fabric 7.4.0 exact, MIT; optional canvas 3.2.3 and jsdom 26.1.0 additions are MIT; offline frozen lock validation passed'
  - 'DIFF: git diff --check passed'
  - 'CORRECTION TDD RED: 5 focused failures exposed missing strict crop bounds, scene revision, async MediaBox completion, and 11 raw controls before correction'
  - 'CORRECTION FOCUSED GREEN: 5 suites, 33 tests passed, including raw-control.guard'
  - 'CORRECTION REAL ENGINE: production FabricImageEditorEngine covered asymmetric crop with exact undo, flip, resize, reorder, delete, separate freehand strokes, serialized rapid undo, and Fabric transform revision'
  - 'CORRECTION DOM: source failure disables commands, dirty Escape is contained from the outer modal, second Escape keeps the editor, crop cancel is clean, and rejected awaited completion keeps the editor open without duplicate save'
  - 'CORRECTION EXPORT: zero-byte and wrong-MIME output are rejected; decoded raster dimensions must equal the canvas; busy close is blocked'
  - 'CORRECTION BROWSER: real production modal and Fabric engine applied crop 37/53/900/800, flip, layer ordering, resize 720x640, Cyrillic text, and two freehand strokes; one undo retained exactly one Drawing layer'
  - 'CORRECTION RASTER: retained 17,121-byte 720x640 PNG, SHA-256 416ba995703edcc44edce4eb10331310d7f44d6641455a8d1ee6512645275982, visually inspected with Cyrillic pixels present'
  - 'CORRECTION NETWORK: 14 same-origin resources, zero external/editor-vendor/stock/telemetry/remote-font/upload requests in the in-memory review fixture'
  - 'FINAL CORRECTION TDD RED: 4 focused failures exposed refresh-coupled completion, duplicate-save recovery after an irreversible upload, and missing alertdialog focus ownership'
  - 'FINAL CORRECTION GREEN: 5 focused suites, 33 tests passed on Node 22.23.2; successful upload selects and closes once before best-effort SWR refresh, and refresh rejection resolves as a warning without another upload'
  - 'FINAL CORRECTION ACCESSIBILITY: opening discard focuses Keep editing; Tab and Shift+Tab wrap over only the two alert actions; the editor background is inert; Keep restores focus to Close editor'
  - 'FINAL CORRECTION TYPECHECK/BUILD: frontend TypeScript and targeted Next production build passed on Node 22.23.2'
changed_files:
  - apps/frontend/src/components/media/image-editor/bounds.ts
  - apps/frontend/src/components/media/image-editor/editor-session.ts
  - apps/frontend/src/components/media/image-editor/fabric-engine.ts
  - apps/frontend/src/components/media/image-editor/image-editor-modal.tsx
  - apps/frontend/src/components/media/image-editor/image-editor-surface.tsx
  - apps/frontend/src/components/media/image-editor/image-editor.review-scene.tsx
  - apps/frontend/src/components/media/image-editor/media-completion.ts
  - apps/frontend/src/components/media/image-editor/source-loader.ts
  - apps/frontend/src/components/media/image-editor/types.ts
  - apps/frontend/src/components/media/image-editor/upload-edited-media.ts
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/image-editor/[scene]/page.tsx
  - tests/image-editor.contract.test.cjs
  - tests/image-editor.behavior.test.cjs
  - tests/image-editor.engine.test.cjs
  - tests/image-editor.review.test.cjs
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/browser-matrix.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/request-ledger.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/flow-receipt.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/evidence-manifest.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/correction-receipt.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/correction-request-ledger.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/final-correction-receipt.json
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/edited-cyrillic-correction.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/1440-light-ru-default.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/1440-dark-en-default.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/390-light-ru-default.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/390-dark-en-default.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/correction-1440-light-ru.png
  - .codex/stages/content-factory-next-0c8/evidence/image-editor/screenshots/correction-390-dark-en-crop.png
  - package.json
  - pnpm-lock.yaml
explicit_defers:
  - artifact-is-registered; root-owned-independent-review-resolution-and-final-acceptance-remain
  - root-owned-final-acceptance-and-real-backend-integration-remain-outside-this-worker-stream
  - shared-interface-review-dev-csp-blocks-next-hmr-hydration-and-production-intentionally-hides-review-routes; browser-proof-used-the-documented-disposable-local-harness-exception-only
---

# Summary

The accepted Fabric.js 7.4.0 vertical slice is implemented. An edit button on
an existing PNG, JPEG, or WebP card opens the production editor, and save
uploads a new raster through the existing repository fetch wrapper to
`POST /media/upload-simple`. The original record is never updated. Standalone
media refreshes SWR only; the picker refreshes and adds the validated returned
item once, leaving the existing “Add selected media” path unchanged.

The editor supports crop, numeric resize with aspect lock, 90-degree rotation,
horizontal and vertical flip, explicit Geologica/JetBrains Mono text controls
with Cyrillic, color/size/alignment, rectangle/ellipse/line, configurable
freehand drawing, semantic layer selection and ordering, three local social
presets, and bounded undo/redo by buttons and keyboard.

The correction round replaces the fixed crop with explicit X/Y/width/height
controls and strict canvas bounds. Scene revisions now come from actual Fabric
content history, so merely entering crop or draw mode stays clean while object
transforms become dirty. Every completed freehand stroke has its own history
entry, and all async restore/command work is serialized to prevent rapid
undo/redo races.

The final correction decouples an irreversible successful upload from the
best-effort SWR refresh. Picker completion selects and closes the saved item
exactly once before refreshing; a refresh failure produces a warning instead
of reopening or retrying the already uploaded copy. A direct completion error
also leaves the editor in a terminal saved state with Save disabled.

# Safety and state integrity

- Source loading fetches only the selected URL with credentials and
  `redirect: error`; it rejects failed, redirected, opaque, URL-mismatched,
  non-image, oversized, over-pixel, and undecodable responses.
- Input/export are capped at 10 MiB; decoded input at 20 MP; output at
  64–4096 px per edge and 16,777,216 pixels; the editor caps 100 layers,
  2,000 characters per text layer, 50,000 draw points, and 50 history entries.
- Abort controllers, object URLs, Fabric canvases, subscriptions, and focus
  restoration are disposed on close or source change.
- Save validates the exported Blob and the upload HTTP status plus non-empty
  returned `id` and `path`. Errors and partial responses keep the editor open
  and never select media.
- Export additionally rejects empty or wrong-MIME blobs and decodes the raster
  to prove its dimensions match the canvas. After upload succeeds, the copy is
  terminal: picker selection and close happen once, while SWR refresh is
  best-effort and reports a warning on failure. A direct completion rejection
  stays visible but cannot re-enable Save. A synchronous in-flight guard
  prevents duplicate saves, and Close/Escape cannot dismiss the editor during
  export/upload.
- Dirty Escape is captured inside the editor before the outer media modal can
  consume it. The first dirty Escape opens the discard alertdialog; a second
  Escape or “Keep editing” returns to the unchanged editor. The alert takes
  focus on “Keep editing”, traps forward and reverse Tab between its two
  actions, makes the background inert, and restores focus to Close on keep.
- No Uppy transport is used because its Transloadit/Cloudflare branches would
  invalidate the same-origin privacy proof.

# Browser proof

The review route mounts the real production modal and Fabric engine with a
synthetic locally generated source and in-memory upload. It produced a
55,056-byte PNG containing the edited Cyrillic scene and returned a distinct
`review-edited` media item. The retained evidence includes the eight-state
matrix, four responsive/theme/locale screenshots, focus/Escape/zoom/reduced
motion assertions, the export receipt, and a normalized request ledger with
zero non-local resources.

Correction evidence retains the actual edited raster, not only a JSON receipt:
`edited-cyrillic-correction.png` is a 17,121-byte 720 × 640 PNG with SHA-256
`416ba995703edcc44edce4eb10331310d7f44d6641455a8d1ee6512645275982`.
The browser flow visibly rasterized `Привет, мир — проверка`, performed an
asymmetric crop, flip, layer reorder and numeric resize, drew two strokes, then
proved one undo left one drawing layer.

The tracked review CSP is intentionally `connect-src 'none'`, while Next 16
dev hydration waits for its same-origin HMR WebSocket. Production builds also
intentionally return 404 for review routes. The interactive proof therefore
used a disposable Playwright-only HTML CSP rewrite permitting that one local
WebSocket plus a disposable Chromium local-network flag. No product source,
server configuration, remote endpoint, persistence, or credential was changed.

# Dependency and API evidence

Fabric is pinned exactly to `7.4.0`; Fabric, its newly resolved optional
`canvas 3.2.3`, and `jsdom 26.1.0` report MIT licenses. The lockfile adds the
Fabric optional graph only (247 added lines, no unrelated normalized entries),
and offline frozen lock validation passed.

The project docs resolver reported missing L1 material for the exact version,
so implementation truth came from the installed 7.4.0 declarations and the
official versioned project sources:

- `node_modules/fabric/dist/src/canvas/Canvas.d.ts`
- `node_modules/fabric/dist/src/canvas/StaticCanvas.d.ts`
- `node_modules/fabric/dist/src/shapes/Image.d.ts`
- `node_modules/fabric/dist/src/shapes/IText/IText.d.ts`
- `node_modules/fabric/dist/src/brushes/PencilBrush.d.ts`
- `https://github.com/fabricjs/fabric.js/tree/v7.4.0`
- `https://fabricjs.com/api/classes/canvas/`
- `https://fabricjs.com/api/classes/fabricimage/`
- `https://fabricjs.com/api/classes/itext/`
- `https://fabricjs.com/api/classes/pencilbrush/`

Impeccable product context and the accepted Lazyweb synthesis shaped the
three-column focused canvas/tool/layer hierarchy, explicit save action,
responsive stacking, long-copy handling, and state coverage. The retained
private design evidence is
`https://www.lazyweb.com/agentic-search/6ed17d2a-78bc-48eb-8f3e-a203aebaa5f3`.

# Verification

Focused correction verification passed 33/33 tests across production-engine,
DOM sequencing, contracts, review route, and the raw-control guard. Frontend
TypeScript and the targeted Next production build passed after the final
source changes on Node 22.23.2. The final correction repeated the same five
suites at 33/33 and added executable refresh-failure/terminal-save and real-DOM
alert focus ownership assertions. `git diff --check`, Prettier, evidence JSON parsing, retained
PNG type/dimension/hash checks, and this artifact validator also passed.

The complete retained proof is indexed by
`.codex/stages/content-factory-next-0c8/evidence/image-editor/evidence-manifest.json`.
Correction-specific browser facts are in `correction-receipt.json` and
`correction-request-ledger.json`; the actual raster is
`edited-cyrillic-correction.png`. Final state-integrity proof is in
`final-correction-receipt.json`.

# Risks / Follow-ups

- Root-owned acceptance remains the final integration gate for the shared
  media modal and real authenticated backend upload.
- The existing review-only CSP/Next-dev hydration mismatch still requires the
  documented disposable local harness exception. Product routes and tracked
  CSP were not weakened.
- No server, browser, temporary download, or Playwright session remains. The
  isolated worktree lifecycle is root-owned.

# Handoff

The artifact is registered in the stage manifest. Root should run the one
root-owned acceptance set and decide whether the pre-existing shared review
CSP/dev-hydration limitation needs its own bounded follow-up. No backend,
database, launch-store, Uppy, shared modal, shared icon, manifest, handoff, or
orchestrator file was changed by this stream.
