'use strict';

/**
 * A finished text that exists apart from any post, and what happens when it is
 * cut for somewhere else.
 *
 * Two rules hold this together. The preview is arithmetic, so a person knows
 * what will be different before it is — and a change that loses something is
 * named a loss rather than described as adaptation. And nothing in the recut
 * path touches a platform: it prepares text, publishing sends it, which
 * `docs/product/migration-map.md` states as a rule.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const recut = loadTypeScriptModule(`${base}/recut.ts`);

const SHORT = 'Поставщика поменяли — старый срывал сроки. Зато по графику.';
const WITH_LIST = `Что проверяем:

- остатки на складе
- график отгрузок
- журнал смены`;
const LONG = 'Сроки сдвинулись на два дня. '.repeat(300);

describe('the recut preview is arithmetic', () => {
  test('a short piece on a long-form surface is expanded, and that is not a loss', () => {
    const preview = recut.previewRecut({ body: SHORT, platform: 'site' });
    const length = preview.changes.find((one) => one.aspect === 'length');

    expect(length.from).toBe(String(SHORT.length));
    expect(Number(length.to)).toBeGreaterThan(SHORT.length);
    expect(length.lossy).toBe(false);
  });

  test('a piece over the platform ceiling is cut, and that is a loss', () => {
    const preview = recut.previewRecut({ body: LONG, platform: 'telegram' });
    const length = preview.changes.find((one) => one.aspect === 'length');

    // Cutting text away is a loss. Calling it "optimised for the platform"
    // would be describing the same act in a way that hides it.
    expect(length.to).toBe('4096');
    expect(length.lossy).toBe(true);
  });

  test('lists are reshaped where the platform writes them differently', () => {
    const toVk = recut.previewRecut({ body: WITH_LIST, platform: 'vk' });
    const toSite = recut.previewRecut({ body: WITH_LIST, platform: 'site' });

    expect(
      toVk.changes.find((one) => one.aspect === 'lists')
    ).toMatchObject({ from: 'bullets', to: 'inline', lossy: false });
    expect(toSite.changes.find((one) => one.aspect === 'lists')).toBeUndefined();
  });

  test('losing photos is marked, gaining them is not', () => {
    const fewer = recut.previewRecut({
      body: WITH_LIST,
      images: 3,
      platform: 'telegram',
    });
    const more = recut.previewRecut({
      body: WITH_LIST,
      images: 1,
      platform: 'site',
    });

    expect(fewer.changes.find((one) => one.aspect === 'images').lossy).toBe(
      true
    );
    expect(more.changes.find((one) => one.aspect === 'images').lossy).toBe(
      false
    );
  });

  test('a piece already in the platform shape reports no change at all', () => {
    const preview = recut.previewRecut({
      body: WITH_LIST.repeat(20),
      images: 3,
      platform: 'site',
    });

    // Saying "nothing changes" is more useful than inventing a difference to
    // justify the panel being open.
    expect(preview.unchanged).toBe(true);
    expect(preview.changes).toEqual([]);
  });
});

describe('the recut prepares text and nothing else', () => {
  test('no platform client, no delivery, no scheduling', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    // Comments blanked, and the check is on imports and calls rather than on
    // words: the file names the rule it keeps, and a scan for the words would
    // fail it for documenting that.
    const code = fs
      .readFileSync(path.resolve(__dirname, '..', base, 'recut.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    // `docs/product/migration-map.md`: a new entity reaching a platform
    // directly is exactly what it forbids. Delivery stays with PostsService
    // and the providers.
    expect(code).not.toMatch(/^import .*(?:PostsService|providers|integration)/m);
    expect(code).not.toMatch(/\bfetch\(|\baxios\b/);
    expect(code).not.toMatch(/\.(?:publish|schedule|deliver|send)\s*\(/);
  });

  test('the library row can be described without loading a post', () => {
    const described = recut.describePiece(WITH_LIST);

    expect(described.chars).toBe(WITH_LIST.length);
    expect(described.sentences).toBeGreaterThan(0);
    expect(described.paragraphs).toBe(2);
  });
});

describe('the models say where a post came from', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const schema = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );

  test('a piece is tenant-scoped like the rest of the content contour', () => {
    const model = schema.slice(
      schema.indexOf('model ContentPiece {'),
      schema.indexOf('model ContentDerivation {')
    );

    expect(model).toContain('@@unique([organizationId, id])');
    expect(model).toContain('brandProfileVersionId');
  });

  test('a derivation points at a post rather than at a platform', () => {
    const model = schema.slice(
      schema.indexOf('model ContentDerivation {'),
      schema.indexOf('/// One text a workspace brought in')
    );

    // The derivation records provenance. The post it points at is published
    // by the same path as any other post.
    expect(model).toContain('postId');
    expect(model).toContain('platform');
    expect(model).toContain('@@unique([organizationId, id])');
  });
});
