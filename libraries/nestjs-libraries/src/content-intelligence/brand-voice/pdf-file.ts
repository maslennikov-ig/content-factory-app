/// <reference path="./parse-worker/pdf.worker.entry.ts" />
import { extensionOf } from './text-file';
import type { IntakeCandidate } from './sample-intake';
import {
  MAX_BINARY_FILE_BYTES,
  MAX_PARSE_TIME_MS,
  PARSE_MEMORY_LIMIT_MB,
  removeTempBinaryFile,
  writeTempBinaryFile,
  type BinaryFileInput,
  type BinaryFileResult,
} from './binary-file';
import { parseFailed, runWorkerScript } from './parse-isolation';

// Same build-graph-inclusion device as `docx-file.ts` — see that file's
// comment on the equivalent reference.

const WORKER_DIR = `${__dirname}/parse-worker`;

/**
 * `.pdf` as a `BrandVoiceSample` source, origin `FILE` — the `.docx`
 * counterpart is `docx-file.ts`; both feed the same `IntakeCandidate` shape
 * into `sample-intake.ts`.
 *
 * Unlike `.docx`, a `.pdf` has no cheap parent-side structural pre-scan this
 * module trusts itself to write (there is no equivalent to a zip's central
 * directory to read declared sizes from without parsing the object graph),
 * so past `EXTENSION`/`TOO_LARGE` every remaining question — corrupted,
 * password-protected, no text layer — is answered by `pdf.worker.entry.ts`,
 * inside the same forked, capped process `docx-file.ts` uses.
 */
type FileOutcome =
  | { kind: 'candidate'; candidate: IntakeCandidate }
  | { kind: 'rejected'; entry: BinaryFileResult['rejected'][number] };

async function parseOnePdfFile(file: BinaryFileInput): Promise<FileOutcome> {
  const extension = extensionOf(file.name);
  if (extension !== 'pdf') {
    return { kind: 'rejected', entry: { name: file.name, reason: 'EXTENSION' } };
  }
  if (file.buffer.length > MAX_BINARY_FILE_BYTES) {
    return { kind: 'rejected', entry: { name: file.name, reason: 'TOO_LARGE' } };
  }

  const tempPath = writeTempBinaryFile(file.buffer, '.pdf');
  try {
    const outcome = await runWorkerScript<{ text: string }>(
      WORKER_DIR,
      'pdf.worker.entry',
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

export async function parsePdfFile(
  files: readonly BinaryFileInput[]
): Promise<BinaryFileResult> {
  const outcomes = await Promise.all(files.map(parseOnePdfFile));

  const candidates: IntakeCandidate[] = [];
  const rejected: BinaryFileResult['rejected'] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'candidate') candidates.push(outcome.candidate);
    else rejected.push(outcome.entry);
  }
  return { candidates, rejected };
}
