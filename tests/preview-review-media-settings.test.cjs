require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { PreviewReviewServiceV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/preview-review/v1/preview-review.service.ts', {
  '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
  '@contentfactory/helpers/utils/sanitize.post.content': { sanitizePostContent: value => value },
  '@contentfactory/helpers/utils/strip.html.validation': { stripHtmlValidation: (_mode, value) => value },
  './preview-review.repository': { PreviewReviewRepositoryV1: class {} },
});
const actor = { kind: 'guest', organizationId: 'org-a', postId: 'post-a', grantId: 'grant' };
const clip = { id: 'clip', organizationId: 'org-a', name: 'clip.mp4', path: 'https://storage.test/uploads/clip.mp4', type: 'image', alt: 'Library default', thumbnail: 'https://storage.test/uploads/default.jpg', thumbnailTimestamp: 3000 };
const cover = { id: 'cover', organizationId: 'org-a', name: 'cover.jpg', path: 'https://storage.test/uploads/cover.jpg', type: 'image' };
const defaultCover = { ...cover, id: 'default', name: 'default.jpg', path: clip.thumbnail };
function fixture(references, rows = [clip, cover, defaultCover], registered = []) {
  let current = references;
  const repository = {
    preview: async () => [{ id: 'post-a', content: 'Current post', childrenPost: [], integration: { name: 'Channel' }, image: JSON.stringify(current) }],
    media: async (_org, ids, paths) => rows.filter(row => ids.includes(row.id) || paths.includes(row.path)),
    registeredMediaIds: async ids => registered.filter(id => ids.includes(id)),
  };
  return { service: new PreviewReviewServiceV1(repository), replace: value => { current = value; } };
}
const images = async service => JSON.parse((await service.preview(actor))[0].image);
let previous;
beforeEach(() => { previous = process.env.FRONTEND_URL; process.env.FRONTEND_URL = 'https://storage.test'; });
afterEach(() => { if (previous === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = previous; });

test('legacy external labels survive only through scoped, current-reference media URLs', async () => {
  const source = 'https://public.example/clip.mp4?download=private-query';
  const { service, replace } = fixture([{ id: 'client-label', path: source, alt: 'Post alt' }]);
  const [media] = await images(service);
  expect(media).toMatchObject({ type: 'video', alt: 'Post alt' });
  expect(media.path).toMatch(/^\/preview-review\/v1\/posts\/post-a\/media\/external-/);
  expect(JSON.stringify(media)).not.toContain('public.example');
  expect(JSON.stringify(media)).not.toContain('private-query');
  expect(await service.assertMedia(actor, media.id)).toMatchObject({ path: source });
  replace([{ id: 'client-label', path: 'https://public.example/replacement.mp4' }]);
  await expect(service.assertMedia(actor, media.id)).rejects.toMatchObject({ status: 404 });
});

test('foreign/deleted library IDs and unowned configured-storage paths never become external attachments', async () => {
  const { service } = fixture([
    { id: 'foreign', path: 'https://public.example/image.png' },
    { id: 'deleted', path: 'https://public.example/image.png' },
    { id: 'unregistered-label', path: 'https://storage.test/uploads/foreign.jpg' },
  ], [], ['foreign', 'deleted']);
  expect(await images(service)).toEqual([]);
});

test('post alt and owned cover override defaults; the scoped thumbnail resolves the selected cover', async () => {
  const { service } = fixture([{ id: clip.id, alt: '', thumbnail: cover.path, thumbnailTimestamp: 0 }]);
  const [media] = await images(service);
  expect(media).toMatchObject({ alt: '', thumbnailTimestamp: 0 });
  const thumbnail = new URL(media.thumbnail, 'https://api.test');
  expect(thumbnail.pathname).toBe('/preview-review/v1/posts/post-a/media/clip');
  expect(await service.assertMedia(actor, clip.id, true, thumbnail.searchParams.get('reference'))).toMatchObject({ path: cover.path });
  expect(JSON.stringify(media)).not.toContain('storage.test');
});

test('explicit null settings clear defaults; a missing setting retains the library value', async () => {
  const cleared = fixture([{ id: clip.id, alt: null, thumbnail: null, thumbnailTimestamp: null }]);
  expect((await images(cleared.service))[0]).toMatchObject({ alt: null, thumbnailTimestamp: null });
  expect((await images(cleared.service))[0].thumbnail).toBeUndefined();
  await expect(cleared.service.assertMedia(actor, clip.id, true)).rejects.toMatchObject({ status: 404 });
  const inherited = fixture([{ id: clip.id }]);
  expect((await images(inherited.service))[0]).toMatchObject({ alt: 'Library default', thumbnailTimestamp: 3000 });
});

test('foreign/deleted/non-image covers are omitted and cannot be requested through the scoped thumbnail', async () => {
  for (const thumbnail of ['https://storage.test/uploads/foreign.jpg', 'https://public.example/cover.jpg', clip.path]) {
    const { service } = fixture([{ id: clip.id, thumbnail }]);
    expect((await images(service))[0].thumbnail).toBeUndefined();
    await expect(service.assertMedia(actor, clip.id, true)).rejects.toMatchObject({ status: 404 });
  }
});

test('repeated media references keep distinct per-post covers and invalidate changed reference selectors', async () => {
  const { service, replace } = fixture([{ id: clip.id, thumbnail: cover.path }, { id: clip.id, thumbnail: defaultCover.path }]);
  const media = await images(service);
  expect(media[0].thumbnail).not.toBe(media[1].thumbnail);
  const reference = new URL(media[0].thumbnail, 'https://api.test').searchParams.get('reference');
  replace([{ id: clip.id, thumbnail: defaultCover.path }]);
  await expect(service.assertMedia(actor, clip.id, true, reference)).rejects.toMatchObject({ status: 404 });
});
