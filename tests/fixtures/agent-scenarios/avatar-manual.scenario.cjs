'use strict';

/**
 * A manual avatar (`kcxz.18`): no samples, the six lines in the person's own
 * words, saved verbatim through the hand-written draft's door, then switched
 * on with consent. The avatar is named on the way.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const LINES = {
  WHO_SPEAKS: 'Я, Игорь, основатель студии',
  TONE: 'Спокойно и по делу',
  AUDIENCE: 'Руководители небольших команд',
  SENTENCE_LENGTH: 'Короткие фразы',
  NEVER_SAY: 'Без канцелярита и восклицаний',
  TOPICS: 'Практика команды; ошибки внедрения',
};

module.exports = {
  id: 'avatar-manual',
  title: 'Аватар вручную — шесть строк словами человека, имя, согласие',
  covers: ['avatar.manual', 'avatar.rename', 'avatar.manual.field', 'avatar.activate'],
  world: {
    avatars: [{ id: AVATAR, name: null, kind: 'PERSON', isDefault: true, analysed: false, active: false, samples: [] }],
  },
  turns: [
    {
      say: 'Хочу заполнить аватар вручную и назвать его «Игорь»',
      model: [
        [
          ['tool', 'avatar_rename', { avatarId: AVATAR, name: 'Игорь' }],
          ['tool', 'avatar_manual', { avatarId: AVATAR }],
        ],
        [['text', 'Назвали. Напишите шесть строк: кто говорит, тон, для кого, длина фраз, чего не говорим, о чём пишем.']],
      ],
    },
    {
      say: Object.values(LINES).join('\n'),
      model: [
        // All the lines in one call (W3 walk P2-B): one step, not six.
        [
          [
            'tool',
            'avatar_manual_field',
            { avatarId: AVATAR, lines: Object.entries(LINES).map(([field, text]) => ({ field, text })) },
          ],
        ],
        [['tool', 'avatar_activate', { avatarId: AVATAR, mode: 'manual' }]],
      ],
    },
    { resume: { consentGiven: true }, model: [[['text', 'Аватар «Игорь» включён.']]] },
  ],
  check: (run) => {
    const [named, filled, consent] = run.turns;
    expect(named.outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    // The draft read: nothing filled yet, shown as the avatar card.
    const manual = named.outputs.find(({ toolName }) => toolName === 'avatar_manual').output;
    expect(manual.summary.untrustedData.value).toMatchObject({ avatarId: AVATAR, mode: 'manual', done: 0 });
    expect(manual.card).toEqual({ kind: 'avatar', id: AVATAR });

    // Each line verbatim, through the manual door; the last save counts five.
    expect(run.requests.filter(([name]) => name === 'voice.manual.field')).toEqual(
      Object.entries(LINES).map(([key, text]) => ['voice.manual.field', AVATAR, { key, text }])
    );
    // One call wrote all six lines (W3 walk P2-B), and the turn still had
    // steps left for the consent card.
    const written = filled.outputs.filter(({ toolName }) => toolName === 'avatar_manual_field');
    expect(written).toHaveLength(1);
    expect(written[0].output.summary.untrustedData.value).toMatchObject({
      written: Object.keys(LINES),
      filled: 6,
      total: 6,
    });
    expect(filled.modelCalls).toBe(2);
    // Readiness first, then the consent card for the hand-written path.
    expect(filled.suspended[0].payload).toMatchObject({ avatarId: AVATAR, mode: 'manual', canDecideForPerson: false });
    expect(consent.outputs[0].output).toMatchObject({ ok: true, summary: { avatarId: AVATAR, activated: true } });

    expect(run.writes).toEqual([
      ['avatar.renamed', AVATAR, 'Игорь'],
      ...Object.keys(LINES).map((key) => ['avatar.manual.field', AVATAR, key]),
      ['avatar.activated', AVATAR, 'manual'],
    ]);
    // Nothing paid: every row is the turn's own.
    expect(run.admissions.every(([operation]) => operation === 'agent')).toBe(true);
  },
};
