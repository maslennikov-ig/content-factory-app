/**
 * Two checks on a `.docx` that do not need `mammoth`, `jszip`, or a single
 * byte of the archive inflated — both read only the metadata a zip already
 * carries about itself.
 *
 * Both exist because a probe against the real fixtures in
 * `tests/fixtures/brand-voice-binary/` showed `mammoth` cannot make either
 * distinction on its own: an OLE2-wrapped (password-protected) `.docx` and a
 * genuinely truncated one both surface as the same jszip message ("Can't
 * find end of central directory"), and a zip-bomb entry that only inflates
 * to a few megabytes parses to completion without complaint — the guard has
 * to run before `mammoth`, not read its result afterwards.
 */

/**
 * Office wraps a password-protected `.docx` in an OLE2 Compound File Binary
 * container instead of a plain zip; a real `.docx` always starts with
 * `PK\x03\x04`. The signature alone is the whole check — it needs no zip
 * parsing at all, so it runs first.
 */
const OLE_CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

export function isOleCfbContainer(buffer: Buffer): boolean {
  return (
    buffer.length >= OLE_CFB_SIGNATURE.length &&
    buffer.subarray(0, OLE_CFB_SIGNATURE.length).equals(OLE_CFB_SIGNATURE)
  );
}

export type DocxZipGuardOutcome =
  | { ok: true }
  | { ok: false; reason: 'CORRUPTED' | 'DECOMPRESSION_LIMIT'; detail: string };

/**
 * The refused half of the outcome, named as a type of its own.
 *
 * `if (!outcome.ok)` reads as narrowing and is not one here: the backend
 * compiles with `strictNullChecks` off, and a boolean discriminant does not
 * narrow a union under it. A predicate does, whatever the flag says — and the
 * alternative is a cast, which claims the same thing without checking it.
 */
export type DocxZipGuardRefusal = Extract<
  DocxZipGuardOutcome,
  { ok: false }
>;

export const docxZipGuardRefused = (
  outcome: DocxZipGuardOutcome
): outcome is DocxZipGuardRefusal => !outcome.ok;

export type DocxZipGuardBudgets = {
  maxEntryRatio: number;
  maxTotalUncompressedBytes: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
// A zip comment can be up to 65535 bytes; the EOCD record can start anywhere
// in that trailing window.
const EOCD_SEARCH_WINDOW = EOCD_MIN_SIZE + 0xffff;
// No legitimate `.docx` carries anywhere near this many parts; a count past
// it is itself a reason to stop trusting the declared structure rather than
// iterate it.
const MAX_ENTRIES = 10_000;
// The zip64 sentinel: a 32-bit size field of exactly this value means the
// real size lives in a zip64 extra field this scan does not parse. Treated
// as a decompression-limit refusal rather than silently trusting a smaller
// number that is not the real one.
const ZIP64_SENTINEL = 0xffffffff;

function findEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - EOCD_SEARCH_WINDOW);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= start; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * Reads the central directory's declared compressed and uncompressed size
 * for every entry and refuses before `mammoth` ever inflates one, on either
 * of two conditions: one entry's ratio past `maxEntryRatio`, or the sum of
 * declared uncompressed sizes past `maxTotalUncompressedBytes`.
 *
 * A missing or unreadable end-of-central-directory record is refused as
 * `CORRUPTED` here too — the same structural question `mammoth` would
 * otherwise answer with a less specific message, answered before a process
 * is forked to ask it.
 */
export function scanDocxZip(
  buffer: Buffer,
  budgets: DocxZipGuardBudgets
): DocxZipGuardOutcome {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    return {
      ok: false,
      reason: 'CORRUPTED',
      detail: 'no end-of-central-directory record found',
    };
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_ENTRIES) {
    return {
      ok: false,
      reason: 'DECOMPRESSION_LIMIT',
      detail: `${totalEntries} central directory entries exceeds ${MAX_ENTRIES}`,
    };
  }
  if (centralDirectoryOffset >= buffer.length) {
    return {
      ok: false,
      reason: 'CORRUPTED',
      detail: 'central directory offset points outside the file',
    };
  }

  let cursor = centralDirectoryOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buffer.length) {
      return {
        ok: false,
        reason: 'CORRUPTED',
        detail: `central directory entry ${i} runs past the end of the file`,
      };
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      return {
        ok: false,
        reason: 'CORRUPTED',
        detail: `central directory entry ${i} has the wrong signature`,
      };
    }

    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL
    ) {
      return {
        ok: false,
        reason: 'DECOMPRESSION_LIMIT',
        detail: `entry ${i} declares a zip64 size, which this guard does not trust unread`,
      };
    }

    if (compressedSize > 0) {
      const ratio = uncompressedSize / compressedSize;
      if (ratio > budgets.maxEntryRatio) {
        return {
          ok: false,
          reason: 'DECOMPRESSION_LIMIT',
          detail: `entry ${i} compresses at ${ratio.toFixed(1)}:1, over ${budgets.maxEntryRatio}:1`,
        };
      }
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > budgets.maxTotalUncompressedBytes) {
      return {
        ok: false,
        reason: 'DECOMPRESSION_LIMIT',
        detail: `declared uncompressed total exceeds ${budgets.maxTotalUncompressedBytes} bytes`,
      };
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return { ok: true };
}
