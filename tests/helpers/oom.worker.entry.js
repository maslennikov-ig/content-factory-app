'use strict';

/**
 * A worker for `tests/brand-voice.parse-isolation.test.cjs` only — proves
 * the memory ceiling (`--max-old-space-size`, set by `runWorkerScript` from
 * `IsolationBudgets.memoryLimitMb`) ends a process that keeps allocating,
 * the way a hostile file that made it past `docx-zip-guard.ts`'s cheap
 * checks and into a real parse still could.
 *
 * Grows the V8 *old-generation JS heap* specifically, with plain JS
 * strings — `--max-old-space-size` limits that heap, not the process's
 * total memory, so a `Buffer.alloc` loop (backed by external/off-heap
 * memory, outside V8's managed heap) would not trip it at all. Plain JS
 * strings are also the honest model of the threat: `mammoth`'s decompressed
 * XML and `pdf.js`'s extracted text both end up as ordinary JS strings on
 * this same heap, which is exactly what this ceiling is meant to catch
 * growing without bound. Never sends a `message`, so the only way this
 * process ends is the ceiling itself.
 */
const chunks = [];
// eslint-disable-next-line no-constant-condition
while (true) {
  chunks.push('x'.repeat(1024 * 1024));
}
