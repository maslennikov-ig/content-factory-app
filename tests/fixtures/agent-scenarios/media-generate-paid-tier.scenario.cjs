'use strict';

const { GENERATED, mediaRows } = require('./media-rows.cjs');

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

/**
 * With billing configured, a paid tier's picture credits are counted in its
 * monthly window (review W4-25 F8): the chat reads the subscription as the
 * web request's organization carries it, so the tier and the window are the
 * door's. STANDARD draws 20 a month: 19 used in this window and 20 from the
 * month before leave one — the picture is drawn.
 */
module.exports = {
  id: 'media-generate-paid-tier',
  title: 'Платный тариф: считаются картинки этого месяца, прошлый не мешает',
  covers: ['media.generate'],
  world: {
    ...mediaRows(),
    billing: true,
    // Created long ago on a day that keeps «today» well inside a window.
    subscription: { subscriptionTier: 'STANDARD', totalChannels: 5, isLifetime: false, createdAt: daysAgo(400) },
    credits: [
      { id: 'credit-old', organizationId: 'org-1', type: 'ai_images', credits: 20, createdAt: daysAgo(45) },
      { id: 'credit-now', organizationId: 'org-1', type: 'ai_images', credits: 19, createdAt: daysAgo(0) },
    ],
  },
  turns: [
    {
      say: 'Нарисуй к посту кофейню утром',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1', description: 'кофейня утром' }]],
        [['text', 'Нарисовали.']],
      ],
    },
  ],
  check: (run) => {
    const [made] = run.turns[0].outputs.map((one) => one.output);
    expect(made).toMatchObject({ ok: true, summary: { mediaId: GENERATED, describedBy: 'person-and-post' } });
    expect(run.writes.map(([name]) => name)).toEqual(['credit.used', 'media.saved']);
    // Named by what it shows, so the library's search finds it (F11).
    const saved = run.world.media.find((row) => row.id === GENERATED);
    expect(saved.originalName).toBe('кофейня утром Созвоны без повестки съедают.png');
  },
};
