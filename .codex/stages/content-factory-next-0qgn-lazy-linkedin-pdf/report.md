# LinkedIn PDF loading source proof

The static `image-to-pdf` import is replaced by `loadImageToPdf`, awaited after the existing no-media early return. The adjacent loader follows `google.sdk.ts`: one module promise, reset only on module-load rejection. Successful modules remain cached for the life of the process. Images, JPEG buffers, PDF streams, aggregation buffers and conversion promises remain local to each operation. LinkedIn Page inherits the same provider implementation.

The meaningful RED test loaded the actual integration registry and actual LinkedIn/LinkedIn Page classes with other provider constructors stubbed. The eager source loaded the PDF module once; the assertion required zero. The targeted RED run failed one test and filtered out twelve. This is a local registry boundary proof, not a measurement of a fully booted worker.

GREEN passed all thirteen new tests. They cover empty/absent media, fourteen concurrent module callers, shared import rejection and later independent recovery, concurrent conversion inputs/streams/output buffers, unchanged comments/input and largest-area dimensions, original import/read/sharp/converter/stream errors without operation replay, and failure before the public post method reaches provider upload. Two in-memory synthetic PNGs were converted through installed sharp and image-to-pdf to separate two-page PDFs, compared with a direct reference conversion. Only PDFKit's creation date and timestamp-derived file ID were normalized; all remaining PDF bytes were compared.

Final focused acceptance passed three suites and sixty tests: the thirteen new regressions, the unchanged Temporal contract signature guard and production memory-limit guard. Backend and orchestrator no-emit type checks both exited zero using Node 22.23.2 and pnpm 10.6.1 with incremental writes disabled. Exact commands and logs are included in this stage's evidence. No full suite was run in this child stream.

## Specialist self-review

The type-query import is erased by TypeScript and does not evaluate the package. The installed image-to-pdf 3.0.2 has a default export in both its CommonJS and ESM entrypoints; the actual CommonJS compilation path is exercised by the existing TypeScript test loader and the backend/orchestrator type checks. Concurrent callers share only import completion. The rejection handler clears the import latch before propagating the original exception; it does not retry that import or the conversion. A read, image conversion or stream error cannot clear a successful module load. The module is awaited before image reads, so failed first use cannot dispatch media reads or provider uploads.

This review is the implementing specialist's self-review; independent root review is pending. Source hashes and Git blob comparisons protect the registry, all orchestrator activities/workflows, Temporal module, native connection configuration, queue/cap contracts, deployment limits, package/lockfile/schema, existing Google loader and LinkedIn Page. No dependencies, installed package sources, external assets, auth or provider configuration changed.

## Remaining acceptance and cleanup

Startup import cost is deferred to first PDF use. The first carousel may therefore take longer, and the loaded module remains resident after use. Actual RSS savings, the 60% requirement, release behavior and the full root acceptance are UNKNOWN here. Root owns integration, the full release, provider/runtime smoke if needed and a new complete HOT window with all thirty-three queues. This source proof does not close those requirements.

Graph reviewed using the root's read-only cb51 graph; `convertImagesToPdfCarousel` resolves to the current post/readOrFetch/streamToBuffer path. The new loader is absent from that baseline graph; any graph refresh belongs to the accepted integration boundary. The isolated worktree and owned dependency symlink are retained for root inspection. Tests used in-memory images/streams only; there are no owned background processes, host resources, HTTP/DB actions or private corpus artifacts to clean up. Existing frozen streams remain untouched.
