'use strict';

/**
 * Review W3-18 F3: a samples receipt is the browser's report of an upload
 * only an editor makes, to an avatar of this workspace. One that names an
 * avatar outside it is refused at the door before anything is billed or
 * read by the model.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const ELSEWHERE = 'ffffffff-0000-4000-8000-00000000ffff';
const receipt = (avatarId) => ({
  avatarId,
  files: ['result.json'],
  accepted: 900000,
  refused: [],
  telegram: [],
});

module.exports = {
  id: 'avatar-samples-receipt-foreign',
  title: 'Квитанция образцов с чужим аватаром — дверь отказывает, модель её не читает',
  covers: ['avatar.overview'],
  world: {
    avatars: [{ id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] }],
  },
  refusedTurns: [0],
  turns: [
    { say: 'Вот мой канал', samples: receipt(ELSEWHERE), model: [[['text', 'не должно прозвучать']]] },
    {
      say: 'Вот мой канал',
      samples: receipt(AVATAR),
      model: [[['tool', 'avatar_overview', { avatarId: AVATAR }]], [['text', 'Посмотрим, что взяли.']]],
    },
  ],
  check: (run) => {
    const [foreign, own] = run.turns;
    expect(foreign.refused).toEqual({ status: 400, code: 'AGENT_BAD_REQUEST' });
    expect(foreign.modelCalls).toBe(0);
    expect(foreign.admissions).toEqual([]);
    expect(own.refused).toBeNull();
    expect(own.outputs[0].output).toMatchObject({ ok: true, summary: { avatarId: AVATAR } });
    // Said as a report, not as a fact.
    const read = run.prompts.filter((prompt) => prompt.turn === 1).map((prompt) => prompt.user);
    expect(read.join('\n')).toContain("browser reports");
  },
};
