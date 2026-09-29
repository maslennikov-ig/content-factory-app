'use strict';

/**
 * The rows the media scenarios start from (`kcxz.25`): one draft adaptation of
 * the base piece `p1` for the base channel `c1`, and the media library as the
 * Prisma table `MediaRepository` reads (`world.cjs`, `mediaTable`) — a picture
 * of this workspace the composer just uploaded, one deleted, and one of
 * another workspace. Library ids are UUIDs, as `Media.id` is.
 */
const PICTURE = '11111111-0000-4000-8000-000000000001';
const DELETED = '11111111-0000-4000-8000-000000000002';
const FOREIGN = 'ffffffff-0000-4000-8000-00000000ffff';
/** The id the library gives the first picture a world saves (`mediaTable.create`). */
const GENERATED = '00000000-0000-4000-8000-000000000004';

const ADAPTATION = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Созвоны без повестки съедают день. Мы пишем повестку за час.',
  state: 'draft',
  mediaId: null,
};

const mediaRows = () => ({
  adaptations: [{ ...ADAPTATION }],
  media: [
    {
      id: PICTURE,
      name: 'aZ81kq.png',
      originalName: 'кофейня.png',
      path: 'https://cdn.example/aZ81kq.png',
      deletedAt: null,
      createdAt: '2026-09-27T09:59:00.000Z',
    },
    {
      id: DELETED,
      name: 'old.png',
      originalName: 'старое.png',
      path: 'https://cdn.example/old.png',
      deletedAt: '2026-09-20T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: FOREIGN,
      organizationId: 'org-2',
      name: 'x.png',
      originalName: 'Чужая картинка.png',
      path: 'https://cdn.example/x.png',
      deletedAt: null,
      createdAt: '2026-09-27T09:00:00.000Z',
    },
  ],
});

/** The receipt the composer sends after it uploaded pictures (`LibraryUploadReceipt`). */
const receipt = (...ids) => ({
  media: ids.map((id, index) => ({ id, name: index ? `картинка-${index}.png` : 'кофейня.png', type: 'image/png' })),
});

module.exports = { PICTURE, DELETED, FOREIGN, GENERATED, mediaRows, receipt };
