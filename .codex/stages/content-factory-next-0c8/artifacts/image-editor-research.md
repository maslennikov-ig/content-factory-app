---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-0c8/stage-manifest.json
stream_owner: subagent:image-editor-research
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-0c8.image-editor-research
stage_id: content-factory-next-0c8
repo: content-factory-next
branch: codex/image-editor
base_branch: codex/image-editor
base_commit: 8d6e85e64a99cf329dda1f87fa18a4e07ced3ef0
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the research event; the read-only stream created no disposable runtime, account, package, credential or external mutation.
risk_level: high
risk_tags:
  - licensing
  - privacy
  - supply-chain
  - third-party-network
  - accessibility
affected_surfaces:
  - research
  - frontend
  - media-library
invariants:
  - research-before-package-install-or-implementation
  - agpl-compatible-distribution
  - no-unavoidable-third-party-network-call
  - local-font-and-cyrillic-export-proof-required
verification:
  - 'CONTRACT: read docs/prompts/deep-research-image-editor.md and produced all eight required output sections in order'
  - 'PRIMARY SOURCES: checked official repository license/package/release/commit records and vendor pricing/license/privacy/docs on 2026-08-20; no aggregator or blog is cited as decision evidence'
  - 'GATES: disqualified Polotno, Pintura, tldraw and Photopea before feature ranking; identified Penpot as license-compatible but architecturally unsuitable'
  - 'DECISION: selected Fabric.js 7.4.0 primary and Filerobot 4.9.1 fallback with explicit loss and flip conditions'
  - 'MATRICES: recorded all nine criteria, all eight feature-floor items, 5-user and 50-user one-year TCO at a declared USD 800 engineer-day rate, maintenance dates and evidence gaps'
  - 'BOUNDARY: no package was downloaded or installed and no implementation, manifest, source, test, package.json or pnpm-lock file was changed'
changed_files:
  - docs/research/image-editor-selection.md
  - .codex/stages/content-factory-next-0c8/artifacts/image-editor-research.md
explicit_defers:
  - root-must-register-artifact-in-stage-manifest-before-completion-report
  - exact-react-19-next-16-build-requires-pinned-package-spike
  - exact-bundle-size-requires-lockfile-and-production-build
  - cyrillic-png-jpeg-export-requires-local-font-runtime-proof
  - zero-network-accessibility-and-browser-resource-limits-require-runtime-acceptance
---

# Summary

The research gate recommends **Fabric.js 7.4.0** as the primary client-side
editor foundation. Its MIT license and vendor-independent browser runtime pass
the AGPL distribution and privacy gates. The recommendation deliberately
prices the missing editor UI, history, media roundtrip, accessibility and
hardening at 24 engineer-days instead of treating low-level canvas primitives
as a finished product.

**Filerobot Image Editor 4.9.1** is the single fallback. It is MIT and has a
substantially more complete UI, export callback, history and transformation
surface. Its default backend translation request is documented as
configurable-off and cloud mode is optional, but it remains fallback until a
short spike proves React 19/Next 16, local Cyrillic fonts, layer ordering,
keyboard behavior and a strict third-party network deny rule.

The complete decision, disqualification evidence, nine-criterion comparison,
eight-feature matrix, TCO model, maintenance dates, unverified claims and flip
conditions are in
[`docs/research/image-editor-selection.md`](../../../../docs/research/image-editor-selection.md).

# Verification

The official prompt was used as the acceptance contract. Polotno, Pintura and
tldraw vendor license/pricing pages; Photopea API/privacy pages; and official
GitHub licenses, package manifests, repositories, release records, commits,
security advisories and project documentation were checked on 2026-08-20.
Facts without primary evidence are explicitly marked unknown instead of being
inferred.

The analysis includes the exact public Polotno baseline ($249/month reviewed
grass-roots, $899/month standard), Pintura's non-transferable and restricted
distribution terms, tldraw's downstream production-key requirement, and
Photopea's unavoidable external iframe. Fabric, Filerobot, Konva/react-konva,
TOAST UI, Excalidraw, miniPaint and Penpot were scored across the nine requested
criteria and eight feature-floor items. Cost uses one declared $800 engineer
day and reports both 5-user and 50-user one-year totals.

# Risks / Follow-ups

- Root must register this artifact in the stage manifest before completion is
  reported or the implementation stream begins.
- License conclusions are engineering interpretations and should receive legal
  review if the product's distribution model changes.
- Fabric remains conditional on a focused pinned-version spike: local bundled
  font, Cyrillic raster export, zero external network, bounded media resources
  and the existing media upload roundtrip.
- Filerobot may replace Fabric only if the documented remote translations and
  all other vendor requests are absent under a deny-network browser proof, and
  React 19, TypeScript, Cyrillic, layer ordering and keyboard behavior pass
  without an upstream fork.
- No implementation or package selection was performed in this stream.
