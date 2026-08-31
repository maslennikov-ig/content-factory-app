import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IntakeCandidate } from './sample-intake';

/**
 * The shape `docx-file.ts` and `pdf-file.ts` share, and the ceilings both
 * parsers are held to.
 *
 * `text-file.ts` reads a file as a decoded string, because a person's own
 * browser can decode `.txt` and `.md` before the request is even sent. A
 * `.docx` or `.pdf` cannot be decoded that way — the bytes are the input, and
 * turning them into text is exactly the untrusted step `content-factory-next-uoy`
 * exists to fence off. That is why this is its own type rather than a case
 * added to `TextFileInput`.
 *
 * `content-factory-next-uoy`, by owner decision, requires the ceilings to be
 * set before a library is chosen — not measured against whichever library
 * ends up doing the parsing. The numbers below are set against the two
 * things that are already fixed regardless of library: what the upload
 * screen already promises (`text-file.ts`'s `MAX_FILE_BYTES`, 20&nbsp;MB —
 * one dropzone, one limit, for all four extensions it accepts) and what an
 * ordinary 20-page `.docx`/`.pdf` actually weighs. Twenty pages of prose is a
 * few hundred kilobytes; a 20&nbsp;MB file is already an outlier stuffed
 * with images the analyser throws away regardless, so the ceiling is
 * generous to real documents and still two orders of magnitude under what a
 * deliberately padded file could reach.
 */

export type BinaryFileInput = {
  name: string;
  buffer: Buffer;
};

/**
 * `EXTENSION` and `TOO_LARGE` match `text-file.ts`'s `TextFileResult`
 * verbatim, because they are the same check on the same upload surface. The
 * rest are new: a `.docx`/`.pdf` fails in ways a `.txt` cannot fail in.
 *
 * `PASSWORD_PROTECTED` is its own reason rather than a `CORRUPTED` — a
 * person who protected a file on purpose should not read the same message as
 * a person whose upload got mangled in transit; the two need different next
 * actions (remove the password vs. re-export the file).
 *
 * `NO_TEXT_LAYER` exists because a scanned page a library "successfully"
 * parses into an empty string is not a corrupted file and not a small one —
 * it is a file with nothing in it to read, and `sample-intake.ts`'s generic
 * `EMPTY`/`TOO_SHORT` reasons say "too little text" where the true reason is
 * "no text at all, because nobody typed this page." The corridor a silent
 * empty sample would distort is the reason this is a named case rather than
 * a fallthrough to the general intake rejection.
 *
 * `DECOMPRESSION_LIMIT` is `.docx`'s own: it is a zip, and a zip's central
 * directory can be inspected — declared compressed and uncompressed size per
 * entry — before a single byte is inflated. A ratio past
 * `DOCX_MAX_ENTRY_RATIO`, or a total past `DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES`,
 * is refused at that inspection, before `mammoth` ever runs.
 *
 * `PARSE_TIMEOUT` and `PARSE_CRASHED` are what the isolation boundary itself
 * reports: the child process was killed after `MAX_PARSE_TIME_MS`, or it
 * exited (non-zero, or by a signal — an OOM kill included) without ever
 * sending a result back.
 */
export type BinaryRejectReason =
  | 'EXTENSION'
  | 'TOO_LARGE'
  | 'PASSWORD_PROTECTED'
  | 'CORRUPTED'
  | 'NO_TEXT_LAYER'
  | 'DECOMPRESSION_LIMIT'
  | 'PARSE_TIMEOUT'
  | 'PARSE_CRASHED';

export type BinaryFileResult = {
  candidates: IntakeCandidate[];
  rejected: { name: string; reason: BinaryRejectReason; detail?: string }[];
};

/**
 * Same number as `text-file.ts`'s `MAX_FILE_BYTES`, kept as its own constant
 * rather than an import: the two are equal because the upload screen shows
 * one dropzone and one number for all four extensions, not because a
 * `.docx`/`.pdf` earned the same ceiling on its own reasoning. If the two
 * ever need to diverge, that is a screen-copy decision, not a silent drift —
 * `tests/brand-voice.docx-parser.test.cjs` and `pdf-parser.test.cjs` each
 * assert the value directly against `text-file.ts`'s export.
 */
export const MAX_BINARY_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Wall-clock budget for one file's parse, enforced by killing the isolated
 * process, not by the library's own options — a library option is something
 * a hostile file can still be crafted to outlast.
 *
 * `mammoth` on a 20-page `.docx` and `pdf.js` text extraction on a 20-page
 * `.pdf` both finish in well under a second on ordinary hardware; this is
 * roughly 10x that, wide enough that no legitimate upload is ever close to
 * it, narrow enough that a hung parse does not hold an HTTP request past
 * what a person waits for before assuming the upload failed.
 */
export const MAX_PARSE_TIME_MS = 8_000;

/**
 * Memory ceiling for the isolated process (`--max-old-space-size`), the
 * second half of the same defence: a parse that tries to allocate past this
 * is killed by V8 or by the OS, and the isolation boundary turns that kill
 * into `PARSE_CRASHED` rather than a crash of the process serving other
 * organisations' requests.
 *
 * Sized against `DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES` below: a DOM built over
 * 60&nbsp;MB of XML can need several times that in working memory, so the
 * ceiling sits comfortably above the legitimate worst case and still well
 * under what would trouble the host.
 */
export const PARSE_MEMORY_LIMIT_MB = 512;

/**
 * How many parses may hold a forked process at the same time.
 *
 * Each fork is independently capped at `PARSE_MEMORY_LIMIT_MB`, which is what
 * made parsing a batch in parallel look free: one runaway file cannot hurt
 * another. What it does not bound is the sum — a batch of ten is ten processes
 * entitled to half a gigabyte each, and until an HTTP route accepted files
 * nothing could ask for ten at once. `content-factory-next-vme.9` is what
 * makes that fan-out reachable from the network, so the sum is bounded here,
 * at the one place a process is actually forked.
 *
 * Four, because the ceiling that matters is the host's memory rather than its
 * cores: four × 512 MB is a worst case the container carries, and a fifth file
 * waiting two seconds for a slot is invisible next to the parse itself. The
 * eight-second budget starts when a file gets its slot, not when it was
 * queued, so waiting never turns into `PARSE_TIMEOUT`.
 */
export const MAX_PARALLEL_PARSES = 4;

/**
 * `.docx` is a zip, and unlike `.pdf` its container format is one this
 * module can cheaply inspect without decompressing anything: a central
 * directory entry states its own compressed and uncompressed size. These two
 * numbers are the guard read against that inspection, before `mammoth` (and
 * the jszip it opens the archive with) ever inflates a byte.
 *
 * `DOCX_MAX_ENTRY_RATIO`: `source-fetch.gateway.ts` caps a fetched body's
 * compression ratio at 20 for the same reason — a legitimate payload rarely
 * clears double digits. XML markup compresses better than the prose
 * `source-fetch.gateway.ts` was budgeted against, so this ratio is set
 * higher, at 60, to clear the ratios an ordinarily verbose `document.xml`
 * can reach (double digits, rarely past 20–25) with headroom, while a
 * single-layer DEFLATE bomb — which routinely clears 500:1 — trips it by a
 * wide margin.
 *
 * `DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES`: three times `MAX_BINARY_FILE_BYTES`.
 * A 20&nbsp;MB `.docx` that is mostly XML rather than images is already an
 * extreme outlier; images are already-compressed and roughly 1:1 in the
 * zip, so a legitimate file's *decompressed total* rarely approaches its own
 * compressed size, let alone triples it. 60&nbsp;MB gives that outlier
 * headroom without accepting the hundreds-of-megabytes a bomb aims for.
 */
export const DOCX_MAX_ENTRY_RATIO = 60;
export const DOCX_MAX_TOTAL_UNCOMPRESSED_BYTES = 3 * MAX_BINARY_FILE_BYTES;

/**
 * The parse itself runs in a forked process (`parse-isolation.ts`), which
 * only ever talks to its parent over stdio/IPC — no shared memory. Handing
 * it a 20&nbsp;MB `Buffer` through `process.send` would serialise as a JSON
 * array of byte values, three to four times the buffer's own size, for no
 * reason: the bytes only need to reach the child once. A temp file does
 * that in one write and one read, at the file's own size.
 */
export function writeTempBinaryFile(buffer: Buffer, suffix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-brand-voice-'));
  const filePath = path.join(dir, `upload${suffix}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function removeTempBinaryFile(filePath: string): void {
  fs.rm(path.dirname(filePath), { recursive: true, force: true }, () => {
    // Best-effort: the file lived in the OS temp directory, and a failed
    // cleanup here leaks a few kilobytes there, not a security boundary.
  });
}
