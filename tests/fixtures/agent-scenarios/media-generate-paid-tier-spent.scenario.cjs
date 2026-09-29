'use strict';

const { mediaRows } = require('./media-rows.cjs');

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

/**
 * A paid tier's picture credits spent in this window (review W4-25 F8): the
 * door's `false` before anything is admitted — nothing drawn, nothing
 * counted, the step given back.
 */
module.exports = {
  id: 'media-generate-paid-tier-spent',
  title: 'Платный тариф: картинки этого месяца кончились — отказ без трат',
  covers: ['media.generate'],
  world: {
    ...mediaRows(),
    billing: true,
    subscription: { subscriptionTier: 'STANDARD', totalChannels: 5, isLifetime: false, createdAt: daysAgo(400) },
    credits: [{ id: 'credit-now', organizationId: 'org-1', type: 'ai_images', credits: 20, createdAt: daysAgo(0) }],
  },
  turns: [
    {
      say: 'Сделай картинку к посту',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['text', 'Картинки по тарифу кончились.']],
      ],
    },
  ],
  check: (run) => {
    const [refused] = run.turns[0].outputs.map((one) => one.output);
    expect(refused).toMatchObject({ ok: false, code: 'MEDIA_IMAGE_CREDITS_EXHAUSTED' });
    const operations = run.turns[0].admissions.map(([operation]) => operation);
    expect(operations).toEqual(['agent']);
    expect(run.writes).toEqual([]);
  },
};
