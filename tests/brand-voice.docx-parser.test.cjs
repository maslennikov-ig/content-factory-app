'use strict';

/**
 * `content-factory-next-uoy`: `.docx` as a source for `BrandVoiceSample`,
 * origin `FILE` — the same intake path `text-file.ts` already serves for
 * `.txt`/`.md`, extended by one more parser rather than a second path.
 *
 * `docx-file.ts` does not exist yet. That is the point of this file at this
 * stage: every test below calls the real parser against a real, disk-backed
 * `.docx` — a minimal valid one, a truncated one, an OLE-wrapped
 * password-protected one, one carrying another `.docx` as an untouched
 * attachment, and one whose single entry decompresses at a ratio no
 * legitimate document reaches — built by
 * `tests/fixtures/brand-voice-binary/generate.cjs` and committed beside this
 * file. Nothing here is mocked; the fixtures are real bytes, and the parser
 * either exists and handles them or the whole file fails to load.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const fixtureDir = path.join(__dirname, 'fixtures', 'brand-voice-binary');

const textFile = loadTypeScriptModule(`${base}/text-file.ts`);
const binaryFile = loadTypeScriptModule(`${base}/binary-file.ts`);
// This is the load that is expected to fail right now: `docx-file.ts` is
// `content-factory-next-uoy`'s deliverable, not yet written. Once it exists,
// everything below exercises it for real.
const docxFile = loadTypeScriptModule(`${base}/docx-file.ts`);

const read = (name) => fs.readFileSync(path.join(fixtureDir, name));

const input = (name, buffer) => ({ name, buffer });

describe('binary file ceilings match the ones the upload screen already promises', () => {
  test('MAX_BINARY_FILE_BYTES equals text-file.ts MAX_FILE_BYTES', () => {
    expect(binaryFile.MAX_BINARY_FILE_BYTES).toBe(textFile.MAX_FILE_BYTES);
  });
});

describe('parseDocxFile: the shared checks, run again for this format', () => {
  test('an extension that is not .docx is refused as EXTENSION, not parsed', async () => {
    const result = await docxFile.parseDocxFile([
      input('старый-документ.doc', read('valid-minimal.docx')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([
      { name: 'старый-документ.doc', reason: 'EXTENSION' },
    ]);
  });

  test('a file over MAX_BINARY_FILE_BYTES is refused as TOO_LARGE before parsing', async () => {
    const oversized = Buffer.alloc(binaryFile.MAX_BINARY_FILE_BYTES + 1, 0x41);
    const result = await docxFile.parseDocxFile([
      input('слишком-большой.docx', oversized),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([
      { name: 'слишком-большой.docx', reason: 'TOO_LARGE' },
    ]);
  });
});

describe('parseDocxFile: a real, minimal, valid document', () => {
  test('extracts the paragraph text as one FILE-origin candidate', async () => {
    const result = await docxFile.parseDocxFile([
      input('заметка.docx', read('valid-minimal.docx')),
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    expect(candidate.origin).toBe('FILE');
    expect(candidate.title).toBe('заметка.docx');
    expect(candidate.text).toContain('поставщика подшипников');
  });
});

describe('parseDocxFile: a corrupted archive', () => {
  test('a truncated .docx (no end-of-central-directory) is refused as CORRUPTED, not thrown', async () => {
    const result = await docxFile.parseDocxFile([
      input('битый.docx', read('corrupted.docx')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'битый.docx',
      reason: 'CORRUPTED',
    });
    // The reason code is what the screen branches on; the detail is what a
    // person reads. A refusal with the code but no sentence behind it is
    // half of what "понятное сообщение" asks for.
    expect(result.rejected[0].detail).toEqual(expect.any(String));
    expect(result.rejected[0].detail.length).toBeGreaterThan(0);
  });
});

describe('parseDocxFile: a password-protected document', () => {
  test('an OLE2-CFB-wrapped .docx is refused as PASSWORD_PROTECTED, distinct from CORRUPTED', async () => {
    const result = await docxFile.parseDocxFile([
      input('закрыт-паролем.docx', read('password-protected.docx')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'закрыт-паролем.docx',
      reason: 'PASSWORD_PROTECTED',
    });
  });
});

describe('parseDocxFile: an embedded, untouched attachment', () => {
  test('only the outer document.xml is read; the embedded .docx is never unpacked', async () => {
    const result = await docxFile.parseDocxFile([
      input('с-вложением.docx', read('nested-embedded.docx')),
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    expect(candidate.text).toContain('поставщика подшипников');
    expect(candidate.text).not.toContain('Текст внутри вложения');
  });
});

describe('parseDocxFile: a zip-bomb entry', () => {
  test('a >500:1 single-entry compression ratio is refused as DECOMPRESSION_LIMIT, cheaply', async () => {
    const startedAt = Date.now();
    const result = await docxFile.parseDocxFile([
      input('архив.docx', read('zip-bomb.docx')),
    ]);
    const elapsedMs = Date.now() - startedAt;

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'архив.docx',
      reason: 'DECOMPRESSION_LIMIT',
    });
    // The guard reads the zip's central directory; it does not inflate the
    // 4 MiB the entry actually decompresses to. A real inflate-then-measure
    // approach would still be fast on one file, but nowhere near instant —
    // this ceiling is generous to either implementation while still failing
    // a version that fully materialises the bomb before checking it.
    expect(elapsedMs).toBeLessThan(2_000);
  });
});

describe('parseDocxFile: several files in one call', () => {
  test('one hostile file among good ones is a partial rejection, not a thrown batch failure', async () => {
    const result = await docxFile.parseDocxFile([
      input('первый.docx', read('valid-minimal.docx')),
      input('бомба.docx', read('zip-bomb.docx')),
      input('битый.docx', read('corrupted.docx')),
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('первый.docx');
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'бомба.docx',
          reason: 'DECOMPRESSION_LIMIT',
        }),
        expect.objectContaining({ name: 'битый.docx', reason: 'CORRUPTED' }),
      ])
    );
    expect(result.rejected).toHaveLength(2);
  });
});
