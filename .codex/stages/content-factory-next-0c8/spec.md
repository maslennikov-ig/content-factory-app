# Stage 5: private image editor

## Outcome

Choose an AGPL-compatible, client-only image-editing foundation from current
primary evidence, integrate the smallest complete editor into the existing
media-library flow, and return its raster output through the product's existing
upload path.

## Product contract

- Existing media is the starting point; saved PNG or JPEG becomes an ordinary
  Content Factory media item and can be selected for a post.
- The editor covers crop/resize/rotate/flip, Cyrillic text, shapes/drawing,
  layer order/move/delete, social presets, and undo/redo.
- Runtime may call only same-origin product endpoints and URLs already selected
  from the product media library. No vendor validation, telemetry, hosted font,
  stock-search, CDN, or editor-owned asset-hosting request is allowed.
- Russian and English share the same layout. Bundled fonts are used.
- Unsupported, oversized, corrupt, or tainted media fails visibly without
  overwriting the original.

## Accepted research decision

- Primary foundation: `fabric@7.4.0`, MIT, browser-only and vendor-independent.
- Fallback: `@scaleflex/filerobot-image-editor@4.9.1`, only if a bounded spike
  proves React 19/Next 16, local translations/fonts, layer ordering, keyboard
  behavior and zero external requests without an upstream fork.
- Polotno, Pintura, tldraw and Photopea iframe fail the licence/privacy gates.
  Penpot is licence-compatible but requires a separate backend/exporter stack.
- Detailed evidence and flip conditions live in
  `docs/research/image-editor-selection.md`.

## Technical premortem

Verdict: **GO WITH CONDITIONS**. Rollback is additive and does not delete media.

| Failure symptom | Evidence and mechanism | Required prevention / proof |
|---|---|---|
| Existing image displays but cannot be saved | Confirmed: media paths may be cross-origin and canvas becomes tainted | Fetch only the exact selected path, reject redirects/opaque/CORS failures before mount, keep the source unchanged |
| Editor leaks data or fonts to a vendor | Plausible until pinned runtime is observed | Dependency audit plus browser request ledger; allow only local chunks/fonts, exact selected source and same-origin upload |
| Browser freezes or crashes | Confirmed canvas risk on decoded pixels, layers and full-scene history | 10 MiB input/export, 20 MP decode, 4096 px output edge, 100 layers, 50 history entries, cleanup/dispose tests |
| Save claims success without usable media | Confirmed existing endpoint returns the durable media shape | Validate HTTP and `{id,path}`; update picker/library only after success; failure keeps editor open |
| Original is lost or post state is polluted | Integration map confirms standalone and picker consumers differ | Always create a new media row; standalone only refreshes, picker refreshes and selects once |
| Keyboard or mobile users cannot finish | Existing modal does not own dialog/focus semantics | Editor supplies labelled dialog, focus trap/restore, shortcuts, live status, 44 px targets, 200% zoom proof |
| Executor overbuilds a design suite | Fabric is a primitive library with broad API | Adapter exposes only the eight feature-floor commands; no stock, collaboration, remote templates or server processor |

## Non-goals

- No live publication, paid service, API key, production deployment, public
  delivery, collaborative whiteboard, vector-design suite, or server-side
  media-processing service.
- No claim of full Photoshop/Canva parity.

## Recovery

The implementation is additive and has no database migration. Rollback removes
the editor entry point and its client modules; existing and newly uploaded
media remain ordinary media-library objects.
