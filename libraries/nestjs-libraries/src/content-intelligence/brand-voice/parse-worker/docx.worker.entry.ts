/**
 * Runs alone, in the forked, memory- and time-capped process
 * `parse-isolation.ts` creates for exactly one file. This is the only place
 * `mammoth` is ever called against bytes a caller controls — `docx-file.ts`
 * itself never touches the archive with anything that inflates it; the
 * cheap, trusted checks (`docx-zip-guard.ts`, the OLE2 signature) already
 * ran in the parent before this process was even started.
 *
 * Deliberately plain JavaScript-shaped TypeScript: no decorators, no enums,
 * no relative imports of other project files. `parse-isolation.ts` falls
 * back to running this file straight from source, under Node's
 * `--experimental-strip-types`, whenever a build has not compiled a sibling
 * `.js` next to it — which is the case under Jest, which loads
 * `docx-file.ts` through an in-memory transpiler rather than through `nest
 * build`. Type-stripping only erases types; it does not lower any other TS
 * syntax, so this file has to already be valid JavaScript once its type
 * annotations are removed.
 * Every declaration in this file sits inside one function on purpose. Kept as
 * a script rather than a module — a module would make Node read it as ESM
 * under `--experimental-strip-types` and lose the `require` above — it shares
 * a global scope with its sibling worker, and two top-level `fs` bindings in
 * one program is an error `tsc` only reports once the file is reachable from
 * the build graph at all.
 */

void (function run() {

  const fs = require('node:fs');
  const mammoth = require('mammoth');

  type WorkerOutcome =
    | { ok: true; value: { text: string } }
    | { ok: false; reason: 'CORRUPTED'; detail: string };

  async function main(): Promise<void> {
    const filePath = process.argv[2];
    let outcome: WorkerOutcome;

    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      outcome = { ok: true, value: { text: result.value } };
    } catch (error: unknown) {
      // The guard in `docx-zip-guard.ts` already ruled out the shapes it
      // knows how to name (missing end-of-central-directory, a declared
      // decompression bomb, an OLE2-wrapped password-protected file). What
      // reaches `mammoth` and still fails here is everything else a `.docx`
      // can be broken in — a missing `word/document.xml` part, XML that will
      // not parse, an archive whose declared sizes were honest but whose
      // bytes are not what they claim. All of it is `CORRUPTED`: none of it
      // is a shape a person reads a more specific message for.
      outcome = {
        ok: false,
        reason: 'CORRUPTED',
        detail: error instanceof Error ? error.message : 'parse failed',
      };
    }

    if (typeof process.send === 'function') {
      process.send(outcome);
    }
  }

  return main();
})().then(() => process.exit(0));
