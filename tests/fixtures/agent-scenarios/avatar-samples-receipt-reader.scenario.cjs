'use strict';

/**
 * Review W3-18 F3: a member who may not add samples (USER) cannot send a
 * samples receipt either; the door refuses it before anything runs.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-samples-receipt-reader',
  title: 'Квитанция образцов от участника без права — дверь отказывает',
  covers: ['avatar.list'],
  role: 'USER',
  world: {
    avatars: [{ id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] }],
  },
  refusedTurns: [0],
  turns: [
    {
      say: 'Вот мой канал',
      samples: { avatarId: null, files: ['result.json'], accepted: 3, refused: [], telegram: [] },
      model: [[['text', 'не должно прозвучать']]],
    },
    { say: 'Какие у нас аватары?', model: [[['tool', 'avatar_list', {}]], [['text', 'Один — «Игорь».']]] },
  ],
  check: (run) => {
    const [receipt, list] = run.turns;
    expect(receipt.refused).toEqual({ status: 400, code: 'AGENT_BAD_REQUEST' });
    expect(receipt.admissions).toEqual([]);
    expect(list.outputs[0].output).toMatchObject({ ok: true });
  },
};
