/// <reference path="./parse-worker/docx.worker.entry.ts" />
import { extensionOf } from './text-file';
import type { IntakeCandidate } from './sample-intake';
import {
  DOCX_MAX_ENTRY_RATIO,
  DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_BINARY_FILE_BYTES,
  MAX_PARSE_TIME_MS,
  PARSE_MEMORY_LIMIT_MB,
  removeTempBinaryFile,
  writeTempBinaryFile,
  type BinaryFileInput,
  type BinaryFileResult,
} from './binary-file';
import {
  docxZipGuardRefused,
  isOleCfbContainer,
  scanDocxZip,
} from './docx-zip-guard';
import { parseFailed, runWorkerScript } from './parse-isolation';

// The reference at the top of this file is what makes `tsc` compile
// `docx.worker.entry.ts` into a sibling `.js` — `parse-isolation.ts` reaches
// that file only by forking its compiled path, never by importing it, so
// without the reference nothing would put it in the build graph and the
// forked process would find no script to run. A triple-slash reference rather
// than an `import type`, because the worker entry is deliberately a script
// and not a module: see its own header for why.

const WORKER_DIR = `${__dirname}/parse-worker`;

/**
 * `.docx` as a `BrandVoiceSample` source, origin `FILE` —
 * `content-factory-next-uoy`, alongside `pdf-file.ts` and beside
 * `text-file.ts`'s existing `.txt`/`.md` path. Same output shape
 * (`IntakeCandidate`, fed straight into `sample-intake.ts`'s
 * `prepareSamples`); the difference is everything before that shape exists.
 *
 * Three layers, cheapest first, only the last one ever touching `mammoth`:
 *
 * 1. `EXTENSION` / `TOO_LARGE` — the same two checks `text-file.ts` makes,
 *    on the same upload surface.
 * 2. `isOleCfbContainer` / `scanDocxZip` — structural reads of the zip's own
 *    metadata, trusted because this module wrote the byte-reading itself
 *    and bounded every loop in it. Catches a password-protected file and a
 *    zip-bomb entry before either costs a process fork.
 * 3. `runWorkerScript` — the one call that hands the archive to `mammoth`,
 *    in a forked process with its own memory and time ceiling, for
 *    everything the first two layers cannot see coming: a missing
 *    `word/document.xml` part, XML that will not parse, a hang or a crash
 *    inside the library itself.
 */
type FileOutcome =
  | { kind: 'candidate'; candidate: IntakeCandidate }
  | { kind: 'rejected'; entry: BinaryFileResult['rejected'][number] };

async function parseOneDocxFile(file: BinaryFileInput): Promise<FileOutcome> {
  const extension = extensionOf(file.name);
  if (extension !== 'docx') {
    return { kind: 'rejected', entry: { name: file.name, reason: 'EXTENSION' } };
  }
  if (file.buffer.length > MAX_BINARY_FILE_BYTES) {
    return { kind: 'rejected', entry: { name: file.name, reason: 'TOO_LARGE' } };
  }
  if (isOleCfbContainer(file.buffer)) {
    return {
      kind: 'rejected',
      entry: { name: file.name, reason: 'PASSWORD_PROTECTED' },
    };
  }

  const scan = scanDocxZip(file.buffer, {
    maxEntryRatio: DOCX_MAX_ENTRY_RATIO,
    maxTotalUncompressedBytes: DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES,
  });
  if (docxZipGuardRefused(scan)) {
    return {
      kind: 'rejected',
      entry: { name: file.name, reason: scan.reason, detail: scan.detail },
    };
  }

  const tempPath = writeTempBinaryFile(file.buffer, '.docx');
  try {
    const outcome = await runWorkerScript<{ text: string }>(
      WORKER_DIR,
      'docx.worker.entry',
      [tempPath],
      { timeoutMs: MAX_PARSE_TIME_MS, memoryLimitMb: PARSE_MEMORY_LIMIT_MB }
    );
    if (parseFailed(outcome)) {
      return {
        kind: 'rejected',
        entry: {
          name: file.name,
          reason: outcome.reason,
          detail: outcome.detail,
        },
      };
    }
    return {
      kind: 'candidate',
      candidate: { origin: 'FILE', title: file.name, text: outcome.value.text },
    };
  } finally {
    removeTempBinaryFile(tempPath);
  }
}

export async function parseDocxFile(
  files: readonly BinaryFileInput[]
): Promise<BinaryFileResult> {
  // Parsed in parallel — each fork is independently capped, so nothing is
  // gained by serialising them — but assembled back in the caller's own
  // order rather than completion order, the way `parseTextFiles`'s
  // synchronous loop naturally does; a batch upload should not reorder
  // itself depending on which file happened to finish first.
  const outcomes = await Promise.all(files.map(parseOneDocxFile));

  const candidates: IntakeCandidate[] = [];
  const rejected: BinaryFileResult['rejected'] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'candidate') candidates.push(outcome.candidate);
    else rejected.push(outcome.entry);
  }
  return { candidates, rejected };
}
