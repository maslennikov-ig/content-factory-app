'use strict';

/**
 * Review W3-18 F7: deleting samples is scoped to the named avatar. Codes of
 * another avatar are named on the card as not this avatar's, and «Да» deletes
 * nothing: the call is refused with `VOICE_SAMPLE_NOT_FOUND`.
 */
const PERSON = 'a1a1a1a1-0000-4000-8000-000000000001';
const BRAND = 'a1a1a1a1-0000-4000-8000-000000000002';
const sample = (code, title) => ({ id: `s-${code}`, code, title, origin: 'PASTE', charCount: 600 });

module.exports = {
  id: 'avatar-samples-delete-foreign',
  title: 'Удаление образцов чужого аватара — карточка говорит «нет таких», «Да» ничего не удаляет',
  covers: ['avatar.samples.delete'],
  world: {
    avatars: [
      { id: PERSON, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [sample('smp-01', 'Пост Игоря')] },
      { id: BRAND, name: 'Бренд', kind: 'BRAND', isDefault: false, analysed: true, active: true, samples: [sample('smp-02', 'Пост бренда')] },
    ],
  },
  turns: [
    {
      say: 'Удали у Игоря образец smp-02',
      model: [[['tool', 'avatar_samples_delete', { avatarId: PERSON, codes: ['smp-02'] }]]],
    },
    { approve: true, model: [[['text', 'У Игоря такого образца нет.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals[0].reason).toBe('У аватара «Игорь» нет образца smp-02 — ничего не удалится');
    expect(answer.outputs[0].output).toMatchObject({ ok: false, code: 'VOICE_SAMPLE_NOT_FOUND' });
    expect(run.writes).toEqual([]);
    expect(run.world.avatars[1].samples.map((one) => one.code)).toEqual(['smp-02']);
  },
};
