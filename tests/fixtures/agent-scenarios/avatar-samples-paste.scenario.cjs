'use strict';

/**
 * Pasted own texts (`kcxz.18`): verbatim, as the screen's paste box sends
 * them — own voice, the chat's language, a title from the first words — and
 * the model gets counts back, never the texts.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const POST = 'Созвоны без повестки съедают день, и никто не помнит, о чём договорились в конце.';

module.exports = {
  id: 'avatar-samples-paste',
  title: 'Вставленные тексты — в образцы как с экрана, модели только счёт',
  covers: ['avatar.samples.add', 'avatar.samples'],
  world: {
    avatars: [{ id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: false, active: false, samples: [] }],
  },
  turns: [
    {
      say: `Вот два моих поста:\n${POST}\n\nКоротко.`,
      model: [
        [
          [
            'tool',
            'avatar_samples_add',
            { origin: 'own_post', samples: [{ text: POST }, { text: 'Коротко.' }] },
          ],
        ],
        [['tool', 'avatar_samples', { avatarId: AVATAR }]],
        [['text', 'Взяли один пост; второй слишком короткий.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    const [added, listed] = turn.outputs;
    expect(added.output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, accepted: 1, refused: { TOO_SHORT: 1 } },
      card: { kind: 'avatar', id: AVATAR },
    });
    expect(JSON.stringify(added.output)).not.toContain('Созвоны без повестки');
    // The screen's body (`buildIntakePayload`): own voice, the language, a title.
    expect(run.requests.filter(([name]) => name === 'voice.intake')).toEqual([
      [
        'voice.intake',
        // No id was named: the workspace default took them.
        AVATAR,
        {
          origin: 'OWN_POST',
          usagePurpose: 'OWN_VOICE',
          language: 'ru',
          items: [
            { title: POST.slice(0, 60), text: POST },
            { title: 'Коротко.', text: 'Коротко.' },
          ],
        },
      ],
    ]);
    // The list names codes and titles as data; the texts stay out.
    const value = listed.output.summary.untrustedData.value;
    expect(value).toMatchObject({ total: 1, samples: [{ code: 'smp-01', origin: 'OWN_POST' }] });
    expect(listed.output.summary.untrustedData.sources).toEqual(['workspace-text', 'telegram-export', 'uploaded-file']);
    expect(run.writes).toEqual([['avatar.samples.added', AVATAR, 1]]);
  },
};
