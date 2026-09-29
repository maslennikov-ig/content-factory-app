'use strict';

const { GENERATED, mediaRows } = require('./media-rows.cjs');

/**
 * The acceptance «генерация списывает операцию» (kcxz.25, spec §5.9):
 * «сделай картинку к посту» — decided for the person, the post's own text
 * describes the picture, in the screen's default style. The real
 * `MediaService` spends what the door spends: an image credit row and one
 * `image_generation` operation, admitted apart from the turn, in which the
 * picture prompt is written and drawn (owner 28.09.2026, kcxz.44); the picture is
 * stored and saved into the library, and the agent puts it on the post. The
 * library read afterwards shows it first.
 */
module.exports = {
  id: 'media-generate-to-post',
  title: 'Картинка к посту от ИИ — операции списаны, картинка на посте',
  covers: ['media.generate', 'adaptation.image', 'media.library'],
  world: mediaRows(),
  turns: [
    {
      say: 'Сделай картинку к посту для канала про работу',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: GENERATED }]],
        [['text', 'Нарисовали и поставили к посту.']],
      ],
    },
    {
      say: 'Какие картинки у нас в медиатеке?',
      model: [[['tool', 'media_library', {}]], [['text', 'Две картинки.']]],
    },
  ],
  check: (run) => {
    const [made, library] = run.turns;
    const [generated, set] = made.outputs.map((one) => one.output);
    expect(generated).toMatchObject({
      ok: true,
      card: { kind: 'media', id: 'library' },
      summary: {
        mediaId: GENERATED,
        style: 'Realistic',
        describedBy: 'post',
        forAdaptation: { pieceId: 'p1', adaptationId: 'a1' },
      },
    });
    expect(set).toMatchObject({ ok: true, card: { kind: 'adaptation', id: 'a1' } });
    // Spent as the door spends: one operation of its own, one credit (kcxz.44).
    expect(made.admissions.map(([operation, , , status]) => [operation, status])).toEqual([
      ['agent', 'succeeded'],
      ['image_generation', 'succeeded'],
    ]);
    expect(run.world.credits.map((row) => [row.type, row.credits])).toEqual([['ai_images', 1]]);
    // The picture prompt is the post's text in the window's markers; the
    // provider draws the prompt it wrote, square, on the image model.
    const [prompted] = run.requests.filter(([name]) => name === 'media.picture-prompt');
    expect(prompted[2]).toContain('Созвоны без повестки съедают день.');
    expect(prompted[2]).toContain('<!-- style -->\nRealistic\n<!-- /style -->');
    expect(run.requests.filter(([name]) => name === 'media.image').map(([, , , model, size]) => [model, size])).toEqual([
      ['image-model', '1024x1024'],
    ]);
    // Stored, saved into the library, set on the post.
    expect(run.writes).toEqual([
      ['credit.used', 'ai_images'],
      ['media.saved', GENERATED],
      ['adaptation.edited', 'a1'],
    ]);
    expect(run.world.adaptations[0].mediaId).toBe(GENERATED);
    // Named by the first words it shows, so the library's search finds it
    // (review W4-25 F11); the stored name stays the file's own.
    const saved = run.world.media.find((row) => row.id === GENERATED);
    expect(saved).toMatchObject({ name: 'generated-1.png', originalName: 'Созвоны без повестки съедают день Мы.png' });
    // The library shows it first, never another workspace's or a deleted one.
    const listed = library.outputs[0].output.summary.untrustedData.value;
    expect(listed.items.map((item) => item.id)).toEqual([GENERATED, '11111111-0000-4000-8000-000000000001']);
    expect(JSON.stringify(listed)).not.toContain('Чужая');
    expect(JSON.stringify(listed)).not.toContain('https://');
  },
};
