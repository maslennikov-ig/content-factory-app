import type { IntakeCandidate } from './sample-intake';
import {
  ALLOWED_EXTENSIONS,
  extensionOf,
  parseTextFiles,
  type TextFileInput,
} from './text-file';
import { parseDocxFile } from './docx-file';
import { parseTelegramExport } from './telegram-export';
import { parsePdfFile } from './pdf-file';
import type { BinaryFileInput, BinaryFileResult } from './binary-file';

/**
 * The one entry point origin `FILE` goes through regardless of extension —
 * `content-factory-next-uoy`'s deliverable, connecting `docx-file.ts` and
 * `pdf-file.ts` to the same intake shape `text-file.ts` already produces for
 * `.txt`/`.md`, so `sample-intake.ts`'s `prepareSamples` — and everything
 * built on it — never has to know which of the three parsers ran, and
 * `BrandVoiceSample`'s own shape never changes.
 *
 * What this file does not do: expose an HTTP surface for it. `text-file.ts`
 * itself is not wired to `brand-voice.controller.ts` either —
 * `content-factory-next-36r.3` left that connection as open work, and
 * making one file's origin decode raw bytes over multipart while the other
 * four still arrive as JSON text is a wire-contract decision (payload
 * transport, request-size limits, and a matching frontend upload control)
 * this task was not scoped to make unilaterally. This module is the piece
 * that HTTP wiring calls into once that decision is made — the same
 * function signature `voice.service.ts`'s `intake` would call today if
 * `text-file.ts` were wired, extended to the two new extensions rather than
 * replaced.
 */

export type FileUpload = {
  name: string;
  buffer: Buffer;
};

export type FileIntakeReason =
  | 'EXTENSION'
  | 'TOO_LARGE'
  | 'BINARY'
  | BinaryFileResult['rejected'][number]['reason'];

export type FileIntakeResult = {
  candidates: IntakeCandidate[];
  rejected: Array<{ name: string; reason: FileIntakeReason; detail?: string }>;
};

const DOCX_EXTENSION = 'docx';
const PDF_EXTENSION = 'pdf';

/**
 * The Telegram Desktop export, which the corpus card has offered since `36r`
 * and nothing has ever accepted.
 *
 * `telegram-export.ts` was written, tested and then called by no one: the
 * card said «файл result.json из „Экспорт истории“» over an upload control
 * that refuses anything but `txt`, `md`, `docx` and `pdf`. For a person whose
 * writing lives in a channel, that card was the whole path in
 * (`content-factory-next-vme.21.13`).
 *
 * It is the one upload that yields many samples from one file — a channel is
 * hundreds of posts — so it is merged as a list rather than as a single
 * outcome, and each post keeps its own message id in `externalRef`.
 */
const TELEGRAM_EXTENSION = 'json';

/**
 * Routes each upload by its extension — `.txt`/`.md` decoded as text and
 * handed to `parseTextFiles`, `.docx`/`.pdf` parsed as bytes through the
 * isolated parsers — and merges the results back in the caller's original
 * order, the same guarantee `parseDocxFile`/`parsePdfFile` each already give
 * within their own extension.
 *
 * An extension this module does not recognise at all (neither
 * `text-file.ts`'s three nor `docx`/`pdf`) is refused as `EXTENSION` here
 * directly, rather than being handed to `parseTextFiles` and refused a
 * second time for the same reason — one decision, one place it is made.
 */
type MergedOutcome =
  | { kind: 'candidate'; candidate: IntakeCandidate }
  | { kind: 'rejected'; entry: FileIntakeResult['rejected'][number] };

/**
 * A bucket's `candidates`/`rejected` each preserve the order of that
 * bucket's own inputs, but which of the two arrays a given input landed in
 * is not known ahead of time — so this walks the bucket's original input
 * list once, taking the next unclaimed candidate or rejection whose name
 * matches. FIFO per name rather than a plain map: two uploads sharing a
 * literal filename inside the same batch (the same person picking the same
 * file twice, most plausibly) still each get their own outcome instead of
 * one silently overwriting the other.
 */
function reorderBucket(
  names: readonly string[],
  candidates: readonly IntakeCandidate[],
  rejected: readonly FileIntakeResult['rejected'][number][]
): MergedOutcome[] {
  const candidateQueues = new Map<string, IntakeCandidate[]>();
  for (const candidate of candidates) {
    const queue = candidateQueues.get(candidate.title) ?? [];
    queue.push(candidate);
    candidateQueues.set(candidate.title, queue);
  }
  const rejectedQueues = new Map<string, FileIntakeResult['rejected'][number][]>();
  for (const entry of rejected) {
    const queue = rejectedQueues.get(entry.name) ?? [];
    queue.push(entry);
    rejectedQueues.set(entry.name, queue);
  }

  return names.map((name): MergedOutcome => {
    const candidate = candidateQueues.get(name)?.shift();
    if (candidate) return { kind: 'candidate', candidate };
    const entry = rejectedQueues.get(name)?.shift();
    if (entry) return { kind: 'rejected', entry };
    // Unreachable in practice: every name passed in came from one of the
    // three parsers' own input list, and each of them accounts for every
    // input exactly once.
    return {
      kind: 'rejected',
      entry: { name, reason: 'EXTENSION', detail: 'no outcome reported' },
    };
  });
}

export async function parseUploadedFiles(
  files: readonly FileUpload[]
): Promise<FileIntakeResult> {
  const order: Array<{
    name: string;
    bucket: 'text' | 'docx' | 'pdf' | 'telegram' | 'unrecognised';
  }> = [];
  const textFiles: TextFileInput[] = [];
  const docxFiles: BinaryFileInput[] = [];
  const pdfFiles: BinaryFileInput[] = [];
  const telegram = new Map<
    string,
    { candidates: IntakeCandidate[]; truncated: boolean; seen: number }
  >();

  for (const file of files) {
    const extension = extensionOf(file.name);
    if (extension === TELEGRAM_EXTENSION) {
      order.push({ name: file.name, bucket: 'telegram' });
      telegram.set(file.name, parseTelegramExport(file.buffer.toString('utf8')));
    } else if ((ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      order.push({ name: file.name, bucket: 'text' });
      textFiles.push({
        name: file.name,
        content: file.buffer.toString('utf8'),
        bytes: file.buffer.length,
      });
    } else if (extension === DOCX_EXTENSION) {
      order.push({ name: file.name, bucket: 'docx' });
      docxFiles.push(file);
    } else if (extension === PDF_EXTENSION) {
      order.push({ name: file.name, bucket: 'pdf' });
      pdfFiles.push(file);
    } else {
      order.push({ name: file.name, bucket: 'unrecognised' });
    }
  }

  const [textResult, docxResult, pdfResult] = await Promise.all([
    Promise.resolve(
      textFiles.length ? parseTextFiles(textFiles) : { candidates: [], rejected: [] }
    ),
    docxFiles.length
      ? parseDocxFile(docxFiles)
      : Promise.resolve<BinaryFileResult>({ candidates: [], rejected: [] }),
    pdfFiles.length
      ? parsePdfFile(pdfFiles)
      : Promise.resolve<BinaryFileResult>({ candidates: [], rejected: [] }),
  ]);

  const textOutcomes = reorderBucket(
    textFiles.map((f) => f.name),
    textResult.candidates,
    textResult.rejected
  );
  const docxOutcomes = reorderBucket(
    docxFiles.map((f) => f.name),
    docxResult.candidates,
    docxResult.rejected
  );
  const pdfOutcomes = reorderBucket(
    pdfFiles.map((f) => f.name),
    pdfResult.candidates,
    pdfResult.rejected
  );

  const cursors = { text: 0, docx: 0, pdf: 0, unrecognised: 0 };
  const outcomesByBucket = {
    text: textOutcomes,
    docx: docxOutcomes,
    pdf: pdfOutcomes,
    unrecognised: [] as MergedOutcome[],
  };

  const candidates: IntakeCandidate[] = [];
  const rejected: FileIntakeResult['rejected'] = [];
  for (const { name, bucket } of order) {
    if (bucket === 'telegram') {
      const parsed = telegram.get(name);
      if (!parsed || parsed.candidates.length === 0) {
        // A file that parsed into nothing usable is not a crash: an export of
        // a channel someone only forwards to holds no writing of their own.
        rejected.push({
          name,
          reason: 'NO_TEXT_LAYER',
          detail: parsed ? String(parsed.seen) : undefined,
        });
        continue;
      }
      candidates.push(...parsed.candidates);
      continue;
    }
    const outcome: MergedOutcome =
      bucket === 'unrecognised'
        ? { kind: 'rejected', entry: { name, reason: 'EXTENSION' } }
        : outcomesByBucket[bucket][cursors[bucket]++];
    if (outcome.kind === 'candidate') candidates.push(outcome.candidate);
    else rejected.push(outcome.entry);
  }

  return { candidates, rejected };
}
