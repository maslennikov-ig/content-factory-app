'use strict';

/**
 * The live walk's D2 and D13 together (kcxz.29): after the consent the model
 * wrote a working-memory note longer than the limit, in the same resumed
 * stream that carried the avatar card. The turn must still end on screen —
 * the note is cut to the limit, the stream carries no error — and the person
 * reads the closing answer.
 */
module.exports = {
  id: 'avatar-activate-long-note',
  title: 'Включение аватара, длинная заметка в памяти — ход доходит до конца',
  covers: ['avatar.activate'],
  turns: [
    {
      say: 'Включи аватар',
      model: [[['tool', 'avatar_activate', { avatarId: 'a1', mode: 'manual' }]]],
    },
    {
      resume: { consentGiven: true, avatarName: 'Игорь' },
      model: [
        [
          [
            'tool',
            'updateWorkingMemory',
            {
              memory: {
                notes: [
                  'Аватар не включился с первого раза: одна строка была пуста; человек дописал шестую строку и попросил включить снова, после чего аватар включён.',
                ],
              },
            },
          ],
        ],
        [['text', 'Аватар «Игорь» включён.']],
      ],
    },
  ],
  check: (run) => {
    const [, answer] = run.turns;
    expect(answer.errors).toEqual([]);
    expect(answer.text).toBe('Аватар «Игорь» включён.');
    const note = answer.outputs.find((output) => output.toolName === 'updateWorkingMemory');
    expect(note.output).toEqual({ success: true });
    expect(run.world.avatars[0]).toMatchObject({ id: 'a1', active: true });
  },
};
