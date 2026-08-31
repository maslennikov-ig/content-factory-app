const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/**
 * The Solana wallet login reached `fonts.googleapis.com` because
 * `@solana/wallet-adapter-react-ui/styles.css` opens with an `@import` of a
 * Google-hosted face, and the auth route imported that stylesheet through the
 * wallet provider. Removing the login removed the import; these packages must
 * not come back without someone noticing.
 */
const FORBIDDEN_PACKAGES = [
  '@solana/wallet-adapter-react',
  '@solana/wallet-adapter-react-ui',
  '@postiz/wallets',
];

/**
 * ADR-0007 bans a font CDN for the product's own typography.
 *
 * There used to be one accepted exception: the canvas image editor fetched a
 * Google-hosted face at runtime to rasterise text a person had typed into their
 * own design, which is user content rather than our interface. That editor was
 * removed along with the rest of the third-party clients, so the exception went
 * with it and the rule is now absolute — any reference in the build is a new
 * external font dependency and fails this test.
 */
const GOOGLE_FONTS = 'fonts.googleapis.com';

const collectBuiltAssets = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectBuiltAssets(absolute));
      continue;
    }
    // Source maps only mirror the code they describe, so counting them would
    // report the same reference twice.
    if (entry.isFile() && /\.(js|css)$/.test(entry.name)) files.push(absolute);
  }

  return files;
};

// `.next/dev` holds whatever `next dev` last wrote and can predate the current
// source by weeks; only the production build describes what ships.
const productionBuildRoots = ['apps/frontend/.next/static', 'apps/frontend/.next/server'].map(
  (relative) => path.join(repositoryRoot, relative)
);
const hasProductionBuild = productionBuildRoots.some((root) =>
  fs.existsSync(root)
);

describe('authentication CSS supply chain', () => {
  test('no wallet package that ships a Google font import is a dependency', () => {
    const manifest = JSON.parse(read('package.json'));
    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    expect(
      FORBIDDEN_PACKAGES.filter((name) => name in declared)
    ).toEqual([]);
  });

  test('no source file imports one of those packages', () => {
    const offenders = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;

        const source = fs.readFileSync(absolute, 'utf8');
        if (FORBIDDEN_PACKAGES.some((name) => source.includes(name))) {
          offenders.push(path.relative(repositoryRoot, absolute));
        }
      }
    };

    for (const root of ['apps', 'libraries']) {
      walk(path.join(repositoryRoot, root));
    }

    expect(offenders).toEqual([]);
  });

  // Skipped rather than failed when the build is absent: `pnpm test` on a fresh
  // clone would otherwise report a defect that is only a missing artifact. A
  // skip is visible in the run output; a silent pass would not be.
  (hasProductionBuild ? test : test.skip)(
    'the production build never reaches Google Fonts',
    () => {
      const unexpected = productionBuildRoots
        .flatMap((root) => collectBuiltAssets(root))
        .filter((file) => fs.readFileSync(file, 'utf8').includes(GOOGLE_FONTS))
        .map((file) => path.relative(repositoryRoot, file));

      expect(unexpected).toEqual([]);
    }
  );
});
