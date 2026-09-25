const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * English that reaches a Russian screen without passing through translation.
 *
 * The owner reads the product in Russian and kept meeting English: confirmation
 * dialogs, provider settings in the post window, admin pages, the bell. None of
 * it was missing from `translation.json` — it never asked for a translation. A
 * literal written straight into JSX, into a dialog call or into an options
 * array renders the same in every language.
 *
 * This walks the frontend's syntax trees and reports text in the places a
 * person reads it:
 *   - `jsx-text` / `jsx-expr`: words between tags;
 *   - `jsx-attr:*`: `title`, `placeholder`, `aria-label`, `alt`, `label`, …;
 *   - `call:*`: arguments of `deleteDialog`, `areYouSure`, `toaster.show`, …;
 *   - `prop:*`: `label`, `title`, `text`, … in object literals (option lists);
 *   - `missing-key`: `t('key', …)` whose key no locale carries, so every
 *     language gets the English default (or the raw key);
 *   - `date`: a dayjs month or weekday spelled out, or `fromNow()`, on a value
 *     that was not given the interface language.
 *
 * Text written in pairs — `ru ? 'Русский' : 'English'`, an `en: { … }`
 * dictionary next to a Russian one, `{ key, message }` whose key Russian
 * carries — is the bilingual convention of the product's own screens and is
 * not reported. English is recognised by shape (two Latin words, or one
 * capitalised word), which is why exact exemptions live in the test.
 */

const repositoryRoot = path.resolve(__dirname, '..', '..');
const SCANNED = ['apps/frontend/src', 'libraries/react-shared-libraries/src'];
// Stand scenes, fixtures and showcases render synthetic data for the design
// review, not the product.
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', '(stand)', 'interface-review']);
const SKIPPED_FILES = /\.(test|spec|d|review-scenes?|showcase)\./;

const CYRILLIC = /[А-Яа-яЁё]/;
const WORDS = /[A-Za-z]{2,}[^A-Za-z]+[A-Za-z]{2,}|^[A-Z][a-z]{2,}[.!?:]?$/;
const UI_ATTR = /^(title|placeholder|aria-label|aria-description|alt|label|tooltip|description|confirmText|cancelText|buttonText|text|subtitle|message|emptyText|helperText|hint)$/;
const UI_PROP = /^(label|title|description|placeholder|text|message|tooltip|subtitle|hint|heading|name|helperText|emptyText|approveLabel|cancelLabel|confirmLabel|buttonText)$/;
const SINK_CALL = /^(deleteDialog|areYouSure|toaster\.show|toast\.show|toast|toast\.success|toast\.error|alert|confirm)$/;
const SPELLED_DATE = /MMM|ddd|\bA\b|\ba\b/;

const readRussian = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
      ),
      'utf8'
    )
  );

const listFiles = () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !SKIPPED_FILES.test(entry.name)) {
        files.push(full);
      }
    }
  };
  SCANNED.forEach((dir) => walk(path.join(repositoryRoot, dir)));
  return files.sort();
};

const literalText = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => ' X ' + span.literal.text).join('');
  }
  return null;
};

const looksEnglish = (value) => {
  if (!value) return false;
  const text = value.trim();
  return (
    !CYRILLIC.test(text) &&
    WORDS.test(text) &&
    !/^[\w.-]+$/.test(text) && // identifiers, class names
    !/^(text-|[a-z]+-\[|https?:|\/|#|--|\.|[a-z-]+:)/.test(text) && // CSS, URLs, paths
    !/^[a-z0-9-]+( [a-z0-9:[\]/().-]+)+$/.test(text) // utility class lists
  );
};

const calleeName = (call) => call.expression.getText().replace(/\s/g, '');
const isTranslateCall = (call) => /(^|\.)t$/.test(calleeName(call));

function scanInterfaceEnglish() {
  const russian = readRussian();
  const findings = [];

  for (const file of listFiles()) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const relative = path.relative(repositoryRoot, file);
    const report = (node, kind, text) => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push({
        file: relative,
        line: line + 1,
        kind,
        text: text.replace(/\s+/g, ' ').trim(),
      });
    };

    const bilingual = (node) => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isConditionalExpression(parent)) {
          const inTrue = parent.whenTrue.pos <= node.pos && node.end <= parent.whenTrue.end;
          const other = inTrue ? parent.whenFalse : parent.whenTrue;
          if (CYRILLIC.test(other.getText(source))) return true;
        }
        if (ts.isPropertyAssignment(parent) && /^['"]?(en|english)['"]?$/i.test(parent.name.getText(source))) {
          return true;
        }
        if (ts.isVariableDeclaration(parent) && /^(en|EN|english|englishCopy|[A-Za-z]*En)$/.test(parent.name.getText(source))) {
          return true;
        }
        if (ts.isObjectLiteralExpression(parent)) {
          const key = parent.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name.getText(source) === 'key'
          );
          if (key && ts.isStringLiteral(key.initializer) && key.initializer.text in russian) return true;
        }
      }
      return false;
    };
    const check = (node, reportNode, kind) => {
      const text = literalText(node);
      if (looksEnglish(text) && !bilingual(node)) report(reportNode, kind, text);
    };

    const visit = (node) => {
      if (ts.isCallExpression(node) && isTranslateCall(node) && node.arguments[0]) {
        const [keyNode, fallback] = node.arguments;
        if (ts.isStringLiteral(keyNode) && !(keyNode.text in russian)) {
          report(node, 'missing-key', keyNode.text + (fallback ? ` => ${fallback.getText(source)}` : ''));
        }
        // The English default of a known key is the translation's own fallback.
        return;
      }
      if (ts.isJsxText(node) && looksEnglish(node.text)) report(node, 'jsx-text', node.text);
      if (ts.isJsxAttribute(node) && node.initializer && UI_ATTR.test(node.name.getText(source))) {
        const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (value) check(value, node, `jsx-attr:${node.name.getText(source)}`);
      }
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
      ) {
        check(node.expression, node, 'jsx-expr');
      }
      let insideSink = false;
      if (ts.isCallExpression(node) && SINK_CALL.test(calleeName(node))) {
        for (const argument of node.arguments) {
          check(argument, argument, `call:${calleeName(node)}`);
          if (ts.isObjectLiteralExpression(argument)) {
            for (const property of argument.properties) {
              if (ts.isPropertyAssignment(property) && UI_PROP.test(property.name.getText(source))) {
                check(property.initializer, property, `call:${calleeName(node)}.${property.name.getText(source)}`);
              }
            }
          }
        }
      }
      if (
        ts.isPropertyAssignment(node) &&
        UI_PROP.test(node.name.getText(source)) &&
        !(ts.isCallExpression(node.parent.parent) && SINK_CALL.test(calleeName(node.parent.parent)))
      ) {
        check(node.initializer, node, `prop:${node.name.getText(source)}`);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.getText(source);
        const receiver = node.expression.expression.getText(source);
        const spelled =
          method === 'fromNow' ||
          (method === 'format' && node.arguments[0] && SPELLED_DATE.test(literalText(node.arguments[0]) || ''));
        if (spelled && !/\.locale\(|interfaceDayjs|newDayjs/.test(receiver)) {
          report(node, 'date', `${receiver.slice(-40)}.${method}(${node.arguments[0]?.getText(source) ?? ''})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}

module.exports = { scanInterfaceEnglish };

if (require.main === module) {
  for (const f of scanInterfaceEnglish()) {
    console.log(`${f.file}:${f.line} [${f.kind}] ${f.text.slice(0, 120)}`);
  }
}
