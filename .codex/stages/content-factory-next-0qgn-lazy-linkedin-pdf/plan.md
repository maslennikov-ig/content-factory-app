# Conditional LinkedIn PDF module loading

Goal: defer the existing image-to-pdf module graph until the existing PDF-carousel operation needs it, preserving conversion behavior. Root reports the first corrected-release HOT sample at 65.55546% of 1792 MiB, above 60%, after owned QA retirement; the full 31-sample window is still root-owned. Runtime savings remain UNKNOWN.

Concrete delegation benefit: isolated source ownership and independent local implementation while root measures the 30-minute window and other workers own unrelated fixes. No live app changes during that window.

Write zone: only `linkedin.provider.ts`, adjacent `linkedin.pdf.sdk.ts`, focused new LinkedIn PDF tests, and this new stage. Base cb51, branch `codex/lazy-linkedin-pdf-20261002`, worktree `/home/me/code/content-factory-next-worktrees/0qgn-lazy-linkedin-pdf-20261002`. Preserve all other owners' source/evidence and all existing frozen streams. Beads/integration/release remain root-owned.

Documentation: nearest AGENTS; accepted `worker-memory-source-review/report.md` and root acceptance; exact current `google.sdk.ts`, LinkedIn conversion, registry, installed image-to-pdf 3.0.2 CommonJS/ESM source/types and PDFKit. Root graph built from cb51 used readonly for `convertImagesToPdfCarousel`; exact source confirms its post/readOrFetch/streamToBuffer path. No external version claims or docs lookup is necessary.

Asset Routing: existing module-loader testing helper, Jest, installed sharp/image-to-pdf/PDFKit and in-memory synthetic raster fixtures. Reuse dependencies via an owned node_modules symlink. No installation, new package, external asset or provider request.

Design decision: use the established google.sdk.ts memoized promise/failure-reset pattern. Type-only package reference does not load it. Await the module after the existing no-media return, then retain the original per-call image reads/JPEG conversion, largest-area page dimensions, PDF stream aggregation and media replacement. Share no streams, inputs, buffers, authenticated clients or operation promises. A failed module load resets only the import latch and propagates; no operation retry is added. Successful modules remain loaded after first use.

Given registry/provider construction or empty media, When loaded/converted, Then image-to-pdf loads zero times and the no-media input is returned unchanged. Given concurrent first use, Then share one module load and preserve distinct streams/inputs/output buffers. Given import failure, Then all awaiting callers see the original error, no conversion runs, and a later independent call can import again. Given read/sharp/converter/stream failure, Then preserve the original exception without retry/resetting a successfully loaded module. Given synthetic real image inputs, Then produce an equivalent valid two-page PDF using the installed converter, ignoring only its creation date/file ID.

Verification: meaningful RED eager-registry load; focused new loader/converter regressions; existing Temporal signature and 1792 MiB compose guards; backend and orchestrator no-emit types with incremental disabled; diff/ownership/source/protection hashes. No full suite, model/provider HTTP, host/Docker, forced GC or live RAM claim. All 33 queues, shared NativeConnection, activity caps, Temporal contracts, package/lockfile/schema/deploy files remain byte-identical.

Completion event: frozen own commit/diff, command logs/counts, exact source/installed/protected hashes, specialist self-review notes and cleanup. Root reviews/integrates and owns full release/new HOT acceptance. This stream does not close the RAM requirement or epic.

Stop: ownership conflict, dependency/provider/Temporal/public-contract expansion, missing source context or any required live action. No nested delegation is needed for this bounded stream.
