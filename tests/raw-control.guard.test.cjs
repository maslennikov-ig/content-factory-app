const fs = require('node:fs');
const path = require('node:path');
const parser = require('@typescript-eslint/parser');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * Both roots that ship product JSX.
 *
 * The app root alone is not a perimeter, it is a boundary geometry can be
 * pushed across. Scanning only `apps/frontend/src` meant a component carrying a
 * raw `<button>` could be moved into the shared library and the ledger would
 * record a reduction for markup that never changed. With both roots counted, a
 * move fails twice — `stale` where it left, `added` where it arrived — and the
 * combined total does not move on its own.
 *
 * The two roots do not get the same rule. Native controls in the app are
 * bypasses of the shared primitive; native controls in the library are the
 * primitive. `control-definition` below is how the library says so, and it is
 * spelled out narrowly enough that an app component cannot claim it by moving
 * house.
 */
const SOURCE_ROOTS = ['apps/frontend/src', 'libraries/react-shared-libraries/src'];
const LIBRARY_ROOT = 'libraries/react-shared-libraries/src';
const allowlistPath = path.join(repositoryRoot, 'tests/raw-control-allowlist.json');
/**
 * `input` was the blind spot this guard was built to close.
 *
 * The registry started with the three tags that had a shared control, and every
 * text box, checkbox and radio in the product stayed invisible to the one test
 * whose job is to notice a bypass of the shared form layer. A registration form
 * could hand-roll a third checkbox pattern and the ledger would not move.
 *
 * The existing occurrences are grandfathered in the allowlist below with their
 * reasons, exactly as the other tags were: what is counted here is new debt,
 * not old.
 */
const rawTags = new Set(['button', 'input', 'select', 'textarea']);
const sharedImportByTag = {
  button: '@contentfactory/react/form/button',
  input: '@contentfactory/react/form/input',
  select: '@contentfactory/react/form/select',
  textarea: '@contentfactory/react/form/textarea',
};
const categories = new Set([
  'intrinsic-primitive',
  'third-party-adapter',
  'semantic-special-case',
  'missing-capability',
  'control-definition',
]);

const rootOf = (file) =>
  SOURCE_ROOTS.find((root) => file.startsWith(`${root}/`)) ?? null;

/**
 * A control definition is one native element inside one of the library's
 * control directories. Both halves matter: the directory stops an arbitrary
 * library file from claiming the category, and the single element stops a
 * component full of raw buttons from being relabelled as a primitive on its way
 * out of the app.
 */
const CONTROL_DEFINITION_FILE = new RegExp(
  `^${LIBRARY_ROOT}/(form|choice)/[^/]+\\.tsx$`
);

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
};

const scanRawControls = () => {
  const occurrences = new Map();
  const imports = new Map();

  const scanned = SOURCE_ROOTS.flatMap((root) =>
    sourceFiles(path.join(repositoryRoot, root))
  );

  for (const filePath of scanned) {
    const file = path.relative(repositoryRoot, filePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(source, {
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      sourceType: 'module',
    });
    const imported = new Set();
    walk(ast, (node) => {
      if (
        node.type === 'ImportDeclaration' &&
        typeof node.source?.value === 'string'
      ) {
        for (const [tag, moduleName] of Object.entries(sharedImportByTag)) {
          if (node.source.value === moduleName) imported.add(tag);
        }
      }
      if (
        node.type === 'JSXOpeningElement' &&
        node.name?.type === 'JSXIdentifier' &&
        rawTags.has(node.name.name)
      ) {
        const key = `${file}\0${node.name.name}`;
        occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      }
    });
    imports.set(file, imported);
  }

  return { occurrences, imports };
};

const readAllowlist = () => JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

describe('raw native control guard', () => {
  test('keeps the exact native-control exception ledger shrink-only', () => {
    const allowlist = readAllowlist();
    const { occurrences, imports } = scanRawControls();
    const allowed = new Map();
    const invalid = [];

    if (allowlist.version !== 2) invalid.push('allowlist version must be 2');
    if (!Number.isInteger(allowlist.total) || allowlist.total < 0) {
      invalid.push('allowlist total must be a non-negative integer');
    }
    if (!allowlist.allowances || Array.isArray(allowlist.allowances)) {
      invalid.push('allowances must be an object keyed by exact source file');
    }
    if (
      (allowlist.sourceRoots ?? []).join('\n') !== SOURCE_ROOTS.join('\n')
    ) {
      invalid.push('allowlist must declare exactly the scanned source roots');
    }

    const countedByRoot = Object.fromEntries(
      SOURCE_ROOTS.map((root) => [root, 0])
    );

    for (const [file, tags] of Object.entries(allowlist.allowances ?? {})) {
      if (!tags || Array.isArray(tags) || typeof tags !== 'object') {
        invalid.push(`${file}: allowance must be an object keyed by raw tag`);
        continue;
      }
      // An allowance for a file no root scans is an allowance nothing can ever
      // revoke, so it would outlive the file itself.
      if (!rootOf(file)) {
        invalid.push(`${file}: allowance names a file outside every scanned root`);
        continue;
      }
      for (const [tag, entry] of Object.entries(tags)) {
        if (!rawTags.has(tag)) {
          invalid.push(`${file}: ${tag} is not a supported raw control tag`);
          continue;
        }
        if (!entry || Array.isArray(entry) || typeof entry !== 'object') {
          invalid.push(`${file}: ${tag} must have a structured allowance`);
          continue;
        }
        const { count, category, reason, followUp } = entry;
        if (!Number.isInteger(count) || count < 1) {
          invalid.push(`${file}: ${tag} count must be a positive integer`);
        }
        if (!categories.has(category)) {
          invalid.push(`${file}: ${tag} has an invalid category`);
        }
        if (typeof reason !== 'string' || !reason.trim()) {
          invalid.push(`${file}: ${tag} must include a concise reason`);
        }
        if (
          (category === 'semantic-special-case' || category === 'missing-capability') &&
          (typeof followUp !== 'string' || !followUp.trim())
        ) {
          invalid.push(`${file}: ${tag} must include a follow-up title`);
        }
        if (
          category === 'semantic-special-case' &&
          !/^content-factory-next-[a-z0-9.]+$/.test(followUp)
        ) {
          invalid.push(`${file}: ${tag} must reference a Content Factory follow-up Bead`);
        }
        if (
          (category === 'intrinsic-primitive' ||
            category === 'third-party-adapter' ||
            category === 'control-definition') &&
          followUp !== 'no follow-up needed'
        ) {
          invalid.push(`${file}: ${tag} must declare no follow-up needed`);
        }
        if (category === 'control-definition') {
          if (!CONTROL_DEFINITION_FILE.test(file)) {
            invalid.push(
              `${file}: only a control module under ${LIBRARY_ROOT}/form or /choice may define a native ${tag}`
            );
          }
          if (count !== 1) {
            invalid.push(
              `${file}: a control definition renders one native ${tag}, not ${count}`
            );
          }
        } else if (rootOf(file) === LIBRARY_ROOT) {
          // Everything else in the library is a consumer of the shared control
          // exactly like the app is, and gets no quieter treatment for living
          // next door to it.
          invalid.push(
            `${file}: a library file that is not a control definition must use the shared ${tag}`
          );
        }
        allowed.set(`${file}\0${tag}`, count);
        countedByRoot[rootOf(file)] += count;
      }
    }

    // Per-root figures are what make a relocation legible. Without them the
    // combined total could stay put while the app quietly emptied its debt into
    // the library, and the one number a reader checks would say nothing changed.
    const declaredByRoot = allowlist.rootTotals ?? {};
    for (const root of SOURCE_ROOTS) {
      if (declaredByRoot[root] !== countedByRoot[root]) {
        invalid.push(
          `${root}: declared ${declaredByRoot[root]}, counted ${countedByRoot[root]}`
        );
      }
    }
    const declaredRootTotal = Object.values(declaredByRoot).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    );
    if (declaredRootTotal !== allowlist.total) {
      invalid.push(
        `root totals declare ${declaredRootTotal}, allowlist declares ${allowlist.total}`
      );
    }

    const added = [];
    const stale = [];
    for (const key of new Set([...occurrences.keys(), ...allowed.keys()])) {
      const actual = occurrences.get(key) ?? 0;
      const permitted = allowed.get(key) ?? 0;
      const [file, tag] = key.split('\0');
      if (actual > permitted) added.push(`${file}: ${tag} occurs ${actual}, allowed ${permitted}`);
      if (actual < permitted) stale.push(`${file}: ${tag} occurs ${actual}, allowed ${permitted}`);
      if (actual && imports.get(file)?.has(tag) && !allowed.has(key)) {
        invalid.push(`${file}: raw ${tag} is beside its shared control import`);
      }
    }

    const actualTotal = [...occurrences.values()].reduce((sum, count) => sum + count, 0);
    const ledgerTotal = [...allowed.values()].reduce((sum, count) => sum + count, 0);

    expect({
      invalid,
      added: added.sort(),
      stale: stale.sort(),
      actualTotal,
      ledgerTotal,
      declaredTotal: allowlist.total,
    }).toEqual({
      invalid: [],
      added: [],
      stale: [],
      actualTotal: allowlist.total,
      ledgerTotal: allowlist.total,
      declaredTotal: allowlist.total,
    });
  });
});
