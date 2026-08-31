const fs = require('node:fs');
const path = require('node:path');

const root = process.env.SUPPLY_CHAIN_ROOT || path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

/**
 * Vendors that were taken out of this instance for good.
 *
 * Every one of them was a component that reported to somebody else's server:
 * an error collector, a product-analytics client, an advertising pixel, a
 * support widget, an editor that phoned its licence server. Switching them off
 * behind a flag was the first move; this file is the second, because a disabled
 * component comes back with one line and nobody sees it happen.
 *
 * The guard fails on three surfaces, because those are the three ways a vendor
 * returns: declared as a dependency, imported by a source file, or reached by a
 * hard-coded endpoint. Re-adding one has to be a deliberate act that shows up in
 * a red test, is argued for, and is then written into the ledger at the bottom.
 *
 * What this file deliberately does NOT scan:
 *
 *   docs/  — the operations notes describe exactly what left and why. A doc that
 *            could not name `posthog` would be a doc that cannot warn anyone.
 *   locales/ — orphaned translation strings send no packets.
 *   tests/ — this file names every vendor by definition.
 */
const vendors = [
  {
    key: 'posthog',
    label: 'PostHog',
    carried:
      "every product event, and an identify call carrying the user's email and name.",
    packages: ['posthog-js'],
    markers: [/posthog/i],
    env: [],
  },
  {
    key: 'plausible',
    label: 'Plausible',
    carried:
      'every page view, to a domain that is not ours. Matched by the package, the host, the provider component and the global it installs — not by the English word "plausible", which is an ordinary adjective and was making this guard fail a file for the sentence it was written in rather than for anything it does.',
    packages: ['next-plausible'],
    markers: [
      /next-plausible/i,
      /plausible\.io/i,
      /PlausibleProvider/,
      /\bwindow\s*\.\s*plausible\b/i,
      /\bplausible\s*\(/i,
      /NEXT_PUBLIC_PLAUSIBLE_DOMAIN/,
    ],
    env: ['NEXT_PUBLIC_PLAUSIBLE_DOMAIN'],
  },
  {
    key: 'dub-analytics',
    label: 'Dub analytics',
    carried:
      'referral and click attribution, and it switched itself on from the mere presence of a Stripe key. Matched by the analytics package and its cookie rather than by the word "dub": the short-link providers under libraries/nestjs-libraries/src/short-linking/ are a different, self-hostable thing and stay.',
    packages: ['@dub/analytics'],
    markers: [/@dub\/analytics/, /dub_partner_data/, /DubAnalytics/],
    env: ['NEXT_PUBLIC_DUB_REFER_DOMAIN'],
  },
  {
    key: 'datafast',
    label: 'datafa.st',
    carried:
      'a page-view tag in the document head, and a server-side goal call carrying the address someone registered with. The visitor id travelled the whole way to get there: a cookie the browser read, a field on three request DTOs, a Stripe metadata write. The field name is therefore a marker of its own — a tree that still carries the plumbing is one line away from carrying the call again.',
    packages: [/datafast/i, /datafa\.st/i],
    markers: [
      /datafa\.st/i,
      /datafast_visitor_id/i,
      /datafast_session_id/i,
      /DATAFAST_API_KEY/,
    ],
    env: ['DATAFAST_API_KEY'],
  },
  {
    key: 'google-tag-manager',
    label: 'Google Tag Manager',
    carried:
      'whatever tags the container was configured with, plus a conversion ping on trial start. Its fetch script also reached googletagmanager.com during `pnpm install`.',
    packages: [],
    markers: [/googletagmanager/i, /NEXT_PUBLIC_GTM_ID/, /\bgtag\(/],
    env: ['NEXT_PUBLIC_GTM_ID', 'NEXT_PUBLIC_TRACKING_TRIAL'],
  },
  {
    key: 'facebook-pixel',
    label: 'the Facebook pixel and the Conversions API',
    carried:
      "in the browser, every tracked event; on the server, the user's hashed email, IP address and user agent. `graph.facebook.com` is deliberately absent from the markers: the Facebook and Instagram publishing providers are a product capability and use it legitimately.",
    packages: [
      'facebook-nodejs-business-sdk',
      '@types/facebook-nodejs-business-sdk',
    ],
    markers: [
      /facebook-nodejs-business-sdk/,
      /connect\.facebook\.net/,
      /\bfbq\b/,
      /NEXT_PUBLIC_FACEBOOK_PIXEL/,
      /FACEBOOK_PIXEL_ACCESS_TOKEN/,
    ],
    env: ['NEXT_PUBLIC_FACEBOOK_PIXEL', 'FACEBOOK_PIXEL_ACCESS_TOKEN'],
  },
  {
    key: 'polotno',
    label: 'Polotno',
    carried:
      "our own host name to api.polotno.com on every start, with no way to switch it off, and the user's stock-photo search terms from the side panels. The product has no built-in image editor now; that is a deliberate gap, and a replacement would be self-hosted — content-factory-next-ry5.1.",
    packages: ['polotno'],
    markers: [/polotno/i, /polonto/i, /plontoKey/],
    env: ['NEXT_PUBLIC_POLOTNO'],
  },
  {
    key: 'chatbase',
    label: 'Chatbase',
    carried:
      "our users' support conversations to a third-party AI service — and to the donor company's desk, because the widget hard-coded their bot id.",
    packages: [],
    markers: [/chatbase/i],
    env: ['CHATBASE_TOKEN'],
  },
  {
    key: 'agent-media',
    label: 'AgentMedia',
    carried:
      'a signed JWT holding the id and the name of our organisation, to another company, in exchange for advertising their product inside ours.',
    packages: [],
    markers: [/agent-media/i, /AgentMedia/, /AGENT_MEDIA_SSO_KEY/],
    env: ['AGENT_MEDIA_SSO_KEY'],
  },
];

/**
 * A marker that is allowed to survive, each naming the exact file it excuses and
 * the reason. An allowance is a debt, not a decision: the staleness test at the
 * end fails once the line it describes is gone, so the ledger shrinks rather
 * than accumulating.
 *
 * It is empty: every debt it carried has been paid. Adding one back is allowed
 * only as an argued exception with the file and the reason written down here.
 */
const allowances = [];

const usedAllowances = new Set();

const SOURCE_ROOTS = ['apps', 'libraries', 'scripts'];
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const collectFiles = (relativeRoot, matches) => {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const found = [];

  // Build output mirrors the sources, so a guard that reads it reports the same
  // vendor twice — and keeps reporting it from a stale `dist/` long after the
  // source is gone, which is a failure that says nothing about the tree. The
  // dotted ones (`.next`, `.nx`) are covered by the prefix check below.
  const BUILD_OUTPUT = new Set(['node_modules', 'dist', 'build', 'coverage']);

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (BUILD_OUTPUT.has(entry.name) || entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (entry.isFile() && matches(entry.name)) {
        found.push(path.relative(root, absolute));
      }
    }
  };

  walk(absoluteRoot);
  return found;
};

const manifests = [
  'package.json',
  ...SOURCE_ROOTS.flatMap((relativeRoot) =>
    collectFiles(relativeRoot, (name) => name === 'package.json')
  ),
].filter(exists);

const sourceFiles = SOURCE_ROOTS.flatMap((relativeRoot) =>
  collectFiles(relativeRoot, (name) => SOURCE_EXTENSIONS.test(name))
);

const envTemplates = ['.env.example', 'deploy/production/env.example'].filter(
  exists
);

const declares = (manifest, packageName) => {
  const declared = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.peerDependencies || {}),
    ...(manifest.optionalDependencies || {}),
  };
  return Object.keys(declared).filter((name) =>
    packageName instanceof RegExp
      ? packageName.test(name)
      : name === packageName
  );
};

const excused = (vendorKey, file) => {
  const allowance = allowances.find(
    (candidate) => candidate.vendor === vendorKey && candidate.file === file
  );
  if (!allowance) return false;
  usedAllowances.add(allowance);
  return true;
};

describe('external services stay removed', () => {
  test('only the pinned GlitchTip-compatible SDK returns in its bounded files', () => {
    const declared = [];
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(read(manifestPath));
      for (const section of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        for (const [name, version] of Object.entries(manifest[section] || {})) {
          if (name.startsWith('@sentry/')) {
            declared.push({ manifestPath, section, name, version });
          }
        }
      }
    }
    expect(declared).toEqual([
      {
        manifestPath: 'package.json',
        section: 'dependencies',
        name: '@sentry/nestjs',
        version: '10.70.0',
      },
      {
        manifestPath: 'package.json',
        section: 'dependencies',
        name: '@sentry/nextjs',
        version: '10.70.0',
      },
    ]);

    const allowedSources = new Set([
      'apps/backend/src/main.ts',
      'apps/orchestrator/src/main.ts',
      'apps/frontend/src/instrumentation.ts',
      'apps/frontend/src/instrumentation-client.ts',
      'apps/frontend/src/app/api/browser-errors/route.ts',
      'apps/frontend/src/sentry.server.config.ts',
      'apps/frontend/src/sentry.edge.config.ts',
      'libraries/nestjs-libraries/src/sentry/initialize.sentry.ts',
    ]);
    const markerOffenders = sourceFiles.filter(
      (file) => /\bsentry\b/i.test(read(file)) && !allowedSources.has(file)
    );
    expect(markerOffenders).toEqual([]);
  });

  test('error collection exposes no vendor control plane or hard-coded endpoint', () => {
    for (const template of envTemplates) {
      expect(read(template)).not.toMatch(
        /NEXT_PUBLIC_SENTRY_DSN|SENTRY_ORG|SENTRY_PROJECT|SENTRY_AUTH_TOKEN|SENTRY_SPOTLIGHT/
      );
    }

    const errorSources = sourceFiles.filter(
      (file) =>
        /\bsentry\b/i.test(read(file)) &&
        file !== 'apps/backend/src/main.ts' &&
        file !== 'apps/orchestrator/src/main.ts'
    );
    for (const file of errorSources) {
      expect(read(file)).not.toMatch(/https?:\/\//);
    }
  });

  for (const vendor of vendors) {
    if (vendor.packages.length) {
      test(`no workspace manifest declares ${vendor.label}: it sent ${vendor.carried}`, () => {
        const offenders = [];
        for (const manifestPath of manifests) {
          const manifest = JSON.parse(read(manifestPath));
          for (const packageName of vendor.packages) {
            for (const found of declares(manifest, packageName)) {
              offenders.push(`${manifestPath}: ${found}`);
            }
          }
        }
        expect(offenders).toEqual([]);
      });
    }

    test(`no source file reaches for ${vendor.label}`, () => {
      const offenders = [];

      for (const file of sourceFiles) {
        const contents = read(file);
        const hits = vendor.markers.filter((marker) => marker.test(contents));
        if (!hits.length) continue;
        if (excused(vendor.key, file)) continue;
        offenders.push(`${file}: ${hits.map(String).join(', ')}`);
      }

      expect(offenders).toEqual([]);
    });

    if (vendor.env.length) {
      test(`no environment template offers a ${vendor.label} variable`, () => {
        const offenders = [];
        for (const template of envTemplates) {
          const contents = read(template);
          for (const name of vendor.env) {
            if (contents.includes(name)) offenders.push(`${template}: ${name}`);
          }
        }
        expect(offenders).toEqual([]);
      });
    }
  }

  /**
   * A DTO field is how a value gets back in from the wire, and it is the part
   * that survives longest: the endpoint was one function, but the visitor id
   * was threaded through registration, activation and checkout, so removing
   * only the call would have left the plumbing waiting for a new sink. The
   * field name is guarded by name for that reason.
   */
  test('no request DTO declares a datafa.st tracking field', () => {
    const offenders = [];
    const fields = ['datafast_visitor_id', 'datafast_session_id'];

    for (const file of sourceFiles.filter((name) => /\.dto\.ts$/.test(name))) {
      const contents = read(file);
      for (const field of fields) {
        if (contents.includes(field)) offenders.push(`${file}: ${field}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * The support button survives the removal of the widget that used to sit
   * behind it; only its destination changed. The old name said Discord, and the
   * Discord it named was the upstream project's. The variable is unset, so no
   * button renders until the owner picks a channel — content-factory-next-ry5.5.
   */
  test('the support button is configured by NEXT_PUBLIC_SUPPORT_URL, not by a Discord name', () => {
    for (const template of envTemplates) {
      expect(read(template)).not.toContain('NEXT_PUBLIC_DISCORD_SUPPORT');
    }
    expect(read('.env.example')).toContain('NEXT_PUBLIC_SUPPORT_URL');
  });

  /**
   * Screenshots taken against the owner's own account showed their address in
   * the sidebar of every frame. The tree stops carrying them, and stops being
   * able to carry the next set by accident — content-factory-next-c6k.16.
   */
  test('build and evidence output is not tracked', () => {
    expect(read('.gitignore')).toMatch(/^output\/$/m);
  });

  /**
   * The narrowed Plausible markers, proved on text rather than on trust.
   *
   * Narrowing a marker is the move that can quietly disarm a guard, so the six
   * shapes a real reach takes are checked against synthesized lines, and the
   * adjective is checked to be ignored. Before this, `/plausible/i` failed a
   * screen for the sentence «filling those gaps with plausible-looking numbers
   * is exactly the lie this screen exists to avoid» — a file being failed for
   * documenting the rule it obeys, which is the fifth trap in
   * `docs/product/content-creation-wiring-spec.md`.
   */
  describe('the Plausible markers match the vendor, not the adjective', () => {
    const markers = vendors.find((one) => one.key === 'plausible').markers;
    const caught = (line) => markers.some((marker) => marker.test(line));

    test.each([
      ["import PlausibleProvider from 'next-plausible';", 'the package'],
      ['<script src="https://plausible.io/js/script.js" />', 'the host'],
      ['export default function Page() { return <PlausibleProvider domain="x" />; }', 'the provider'],
      ['window.plausible("signup");', 'the global it installs'],
      ['plausible("pageview");', 'the call'],
      ['NEXT_PUBLIC_PLAUSIBLE_DOMAIN=factory.example', 'the variable'],
    ])('catches %s (%s)', (line) => {
      expect(caught(line)).toBe(true);
    });

    test.each([
      'Filling those gaps with plausible-looking numbers is a lie.',
      'The most plausible explanation is the simplest one.',
    ])('ignores prose: %s', (line) => {
      expect(caught(line)).toBe(false);
    });
  });

  test('every allowance still explains a real line', () => {
    // Depends on the vendor scans above having run, which is why it is last.
    const stale = allowances
      .filter((allowance) => !usedAllowances.has(allowance))
      .map((allowance) => `${allowance.file}: ${allowance.allows}`);

    expect(stale).toEqual([]);
  });
});
