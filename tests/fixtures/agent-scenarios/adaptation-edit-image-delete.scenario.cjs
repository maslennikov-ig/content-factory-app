'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Переписать…» of an adaptation, the hand edit and the picture (the page's
 * `buildAdaptationPatch`), and deleting behind an approval card that names
 * the piece and the channel from the stored rows.
 */
const ROW = { id: 'a1', pieceId: 'p1', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Канал про работу', body: 'Текст', state: 'draft', mediaId: null };

module.exports = {
  id: 'adaptation-edit-image-delete',
  title: 'Адаптация: переписать, правка руками, картинка, удаление',
  covers: ['adaptation.rewrite', 'adaptation.edit', 'adaptation.image', 'adaptation.delete'],
  world: {
    adaptations: [ROW],
    reviewChanges: [{ id: 'w1', basket: 'show', excerpt: 'Текст', replacement: 'Короткий текст', why: 'Короче' }],
  },
  turns: [
    {
      say: 'Перепиши пост короче',
      model: [[['tool', 'adaptation_rewrite', { pieceId: 'p1', adaptationId: 'a1', instruction: 'короче' }]]],
    },
    { resume: { decideForPerson: true }, model: [[['text', 'Переписали.']]] },
    {
      say: 'Замени текст на: Созвоны съедают день. И поставь картинку m7',
      model: [
        [['tool', 'adaptation_edit', { pieceId: 'p1', adaptationId: 'a1', text: 'Созвоны съедают день.' }]],
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: 'm7' }]],
        [['text', 'Готово.']],
      ],
    },
    {
      say: 'Удали эту адаптацию',
      model: [[['tool', 'adaptation_delete', { pieceId: 'p1', adaptationId: 'a1' }]]],
    },
    { approve: true, model: [[['text', 'Адаптация удалена.']]] },
  ],
  check: (run) => {
    const screen = screenPieces();
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p1', 'a1', { instruction: 'короче' }],
    ]);
    expect(run.requests.filter(([door]) => door === 'piece.review.accept')).toEqual([
      ['piece.review.accept', 'p1', 'a1', { token: 'token-1', selectedIds: ['w1'] }],
    ]);
    expect(run.requests.filter(([door]) => door === 'adaptation.edit')).toEqual([
      ['adaptation.edit', 'p1', 'a1', screen.buildAdaptationPatch({ body: 'Созвоны съедают день.' })],
      ['adaptation.edit', 'p1', 'a1', screen.buildAdaptationPatch({ image: { id: 'm7' } })],
    ]);
    const approval = run.turns[3].approvals[0];
    expect(approval.toolName).toBe('adaptation_delete');
    expect(approval.reason).toBe('Удалить адаптацию заготовки cnt-1 для канала «Канал про работу» вместе с её черновиком');
    expect(run.writes).toEqual([
      ['piece.review.accepted', 'p1', ['w1']],
      ['adaptation.edited', 'a1'],
      ['adaptation.edited', 'a1'],
      ['adaptation.deleted', 'a1'],
    ]);
    expect(run.world.adaptations).toEqual([]);
  },
};
