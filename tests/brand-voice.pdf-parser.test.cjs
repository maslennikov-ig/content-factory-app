'use strict';

/**
 * `content-factory-next-uoy`: `.pdf` as a source for `BrandVoiceSample`,
 * origin `FILE` — the second of the two parsers this task adds beside
 * `text-file.ts`.
 *
 * `pdf-file.ts` does not exist yet, so every test here fails on the module
 * load below, not on an assertion — that is the intended red state for this
 * stage. The fixtures are hand-built, real PDF bytes
 * (`tests/fixtures/brand-voice-binary/generate.cjs`): a minimal document with
 * an actual `Tj` text-showing operator, a truncated one, a page with a filled
 * rectangle and no text operator anywhere in it (the shape a scanned page
 * takes), a trailer carrying a `/Encrypt` dictionary, and a document whose
 * `/OpenAction` runs JavaScript while a link annotation points at an
 * external host.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const fixtureDir = path.join(__dirname, 'fixtures', 'brand-voice-binary');

const textFile = loadTypeScriptModule(`${base}/text-file.ts`);
const binaryFile = loadTypeScriptModule(`${base}/binary-file.ts`);
// The expected-to-fail load at this stage: `pdf-file.ts` is
// `content-factory-next-uoy`'s deliverable, not written yet.
const pdfFile = loadTypeScriptModule(`${base}/pdf-file.ts`);

const read = (name) => fs.readFileSync(path.join(fixtureDir, name));

const input = (name, buffer) => ({ name, buffer });

describe('binary file ceilings match the ones the upload screen already promises', () => {
  test('MAX_BINARY_FILE_BYTES equals text-file.ts MAX_FILE_BYTES', () => {
    expect(binaryFile.MAX_BINARY_FILE_BYTES).toBe(textFile.MAX_FILE_BYTES);
  });
});

describe('parsePdfFile: the shared checks, run again for this format', () => {
  test('an extension that is not .pdf is refused as EXTENSION, not parsed', async () => {
    const result = await pdfFile.parsePdfFile([
      input('отчёт.xlsx', read('valid-minimal.pdf')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([{ name: 'отчёт.xlsx', reason: 'EXTENSION' }]);
  });

  test('a file over MAX_BINARY_FILE_BYTES is refused as TOO_LARGE before parsing', async () => {
    const oversized = Buffer.alloc(binaryFile.MAX_BINARY_FILE_BYTES + 1, 0x25);
    const result = await pdfFile.parsePdfFile([
      input('слишком-большой.pdf', oversized),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([
      { name: 'слишком-большой.pdf', reason: 'TOO_LARGE' },
    ]);
  });
});

describe('parsePdfFile: a real, minimal, valid document', () => {
  test('extracts the page text as one FILE-origin candidate', async () => {
    const result = await pdfFile.parsePdfFile([
      input('заметка.pdf', read('valid-minimal.pdf')),
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    expect(candidate.origin).toBe('FILE');
    expect(candidate.title).toBe('заметка.pdf');
    expect(candidate.text).toContain('Zakaz izmenilsya posle vstrechi');
  });
});

describe('parsePdfFile: a corrupted document', () => {
  test('a truncated .pdf (no trailer, no xref) is refused as CORRUPTED, not thrown', async () => {
    const result = await pdfFile.parsePdfFile([
      input('битый.pdf', read('corrupted.pdf')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'битый.pdf',
      reason: 'CORRUPTED',
    });
    expect(result.rejected[0].detail).toEqual(expect.any(String));
    expect(result.rejected[0].detail.length).toBeGreaterThan(0);
  });
});

describe('parsePdfFile: a scanned page with no text layer', () => {
  test('a page with drawing operators and no Tj/TJ anywhere is refused as NO_TEXT_LAYER, never as an empty candidate', async () => {
    const result = await pdfFile.parsePdfFile([
      input('скан.pdf', read('scanned-no-text-layer.pdf')),
    ]);
    // The failure mode this guards against is a *silent* empty sample: a
    // parse that "succeeds" with `text: ''` would let `sample-intake.ts`
    // reject it downstream as EMPTY, which reads as "nothing was here" —
    // wrong for a page that had a photograph on it. The rejection has to
    // happen here, with its own reason, or it does not distinguish the two.
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'скан.pdf',
      reason: 'NO_TEXT_LAYER',
    });
  });
});

describe('parsePdfFile: a password-protected document', () => {
  test('a trailer carrying /Encrypt is refused as PASSWORD_PROTECTED, distinct from CORRUPTED', async () => {
    const result = await pdfFile.parsePdfFile([
      input('закрыт-паролем.pdf', read('password-protected.pdf')),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      name: 'закрыт-паролем.pdf',
      reason: 'PASSWORD_PROTECTED',
    });
  });
});

describe('parsePdfFile: an /OpenAction script and an external link, both inert', () => {
  test('the visible text is extracted; nothing about the JS action or the external URI changes the outcome', async () => {
    const startedAt = Date.now();
    const result = await pdfFile.parsePdfFile([
      input('с-скриптом.pdf', read('hostile-js-and-link.pdf')),
    ]);
    const elapsedMs = Date.now() - startedAt;

    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    // Exactly the page's own drawn text, nothing appended or altered by the
    // /JS action running (it does not run: this module only ever asks
    // pdf.js's core layer for text, never loads its scripting/viewer layer,
    // so an /OpenAction's /JS and a link annotation's /URI are data the
    // parser reads past, not instructions it carries out).
    expect(candidate.text).toContain('Otchet s aktivnoy ssylkoy');
    expect(candidate.text).not.toContain('example-attacker.invalid');
    expect(candidate.text).not.toContain('app.alert');
    // No network egress and no hang from the external reference.
    expect(elapsedMs).toBeLessThan(2_000);
  });
});

describe('parsePdfFile: several files in one call', () => {
  test('one unreadable file among good ones is a partial rejection, not a thrown batch failure', async () => {
    const result = await pdfFile.parsePdfFile([
      input('первый.pdf', read('valid-minimal.pdf')),
      input('скан.pdf', read('scanned-no-text-layer.pdf')),
      input('битый.pdf', read('corrupted.pdf')),
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('первый.pdf');
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'скан.pdf', reason: 'NO_TEXT_LAYER' }),
        expect.objectContaining({ name: 'битый.pdf', reason: 'CORRUPTED' }),
      ])
    );
    expect(result.rejected).toHaveLength(2);
  });
});
