/**
 * The `.pdf` counterpart to `docx.worker.entry.ts` — same isolation, same
 * constraints on its own syntax (see that file's header), the only place
 * `unpdf`'s `pdf.js` core is ever asked to read bytes a caller controls.
 *
 * `.pdf` has no cheap parent-side pre-scan the way `.docx`'s zip central
 * directory allows (`docx-zip-guard.ts`) — there is no equivalently trivial
 * structural summary to read before parsing a PDF's object graph. This
 * process's own memory and time ceiling is the only defence against a
 * hostile `.pdf`, which is why both are enforced here rather than assumed
 * safe because the file "is just text extraction": `getDocumentProxy` is
 * only ever given raw bytes (never a URL), and only `pdf.js`'s core layer is
 * imported — never its viewer or scripting layer — so a `/OpenAction`'s
 * `/JS` and a link annotation's `/URI` are data this process reads past,
 * never instructions it can carry out or a network address it can reach.
 * Every declaration in this file sits inside one function on purpose. Kept as
 * a script rather than a module — a module would make Node read it as ESM
 * under `--experimental-strip-types` and lose the `require` above — it shares
 * a global scope with its sibling worker, and two top-level `fs` bindings in
 * one program is an error `tsc` only reports once the file is reachable from
 * the build graph at all.
 */

void (function run() {

  const fs = require('node:fs');
  const { getDocumentProxy, extractText } = require('unpdf');

  type WorkerOutcome =
    | { ok: true; value: { text: string } }
    | {
        ok: false;
        reason: 'CORRUPTED' | 'PASSWORD_PROTECTED' | 'NO_TEXT_LAYER';
        detail: string;
      };

  async function main(): Promise<void> {
    const filePath = process.argv[2];
    let outcome: WorkerOutcome;

    try {
      const buffer = fs.readFileSync(filePath);
      const pdf = await getDocumentProxy(new Uint8Array(buffer), {
        // Disables `pdf.js`'s own `eval`/`new Function` use in a handful of
        // internal fast paths — belt-and-braces on top of never loading the
        // scripting layer that would run a document's own `/JS`.
        isEvalSupported: false,
      });
      const { text } = await extractText(pdf, { mergePages: true });

      if (text.trim().length === 0) {
        // A page pdf.js opened without error and simply has no text operator
        // on it — the shape a scanned, image-only page takes. Distinct from
        // `CORRUPTED`: the document is not broken, it just has nothing typed
        // on it to read, and `sample-intake.ts`'s generic EMPTY reason would
        // read as "this had nothing in it" rather than "this needs OCR, which
        // is out of scope."
        outcome = {
          ok: false,
          reason: 'NO_TEXT_LAYER',
          detail: `${text.length === 0 ? 'no' : 'only whitespace'} text extracted from ${pdf.numPages} page(s)`,
        };
      } else {
        outcome = { ok: true, value: { text } };
      }
    } catch (error: unknown) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name: unknown }).name)
          : undefined;
      const message = error instanceof Error ? error.message : 'parse failed';

      outcome =
        name === 'PasswordException'
          ? { ok: false, reason: 'PASSWORD_PROTECTED', detail: message }
          : { ok: false, reason: 'CORRUPTED', detail: message };
    }

    if (typeof process.send === 'function') {
      process.send(outcome);
    }
  }

  return main();
})().then(() => process.exit(0));
