'use strict';

/**
 * Consent is the person's (the `input` class): the agent asks on a card,
 * waits, and switches the avatar on only with the person's answer.
 */
module.exports = {
  id: 'avatar-activate',
  title: 'Включение аватара — вопрос и продолжение',
  covers: ['avatar.activate'],
  turns: [
    {
      say: 'Включи аватар',
      model: [[['tool', 'avatar_activate', { avatarId: 'a1', mode: 'assist' }]]],
    },
    { resume: { consentGiven: true, avatarName: 'Игорь' }, model: [[['text', 'Аватар включён.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.suspended).toEqual([
      {
        runId: expect.any(String),
        toolName: 'avatar_activate',
        payload: {
          question: expect.stringContaining('Включить этот аватар?'),
          avatarId: 'a1',
          mode: 'assist',
          canDecideForPerson: false,
          // The card's id, sent back with the answer (review W2 F3).
          cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
        },
      },
    ]);
    // Nothing is switched on while the card waits.
    expect(ask.outputs).toEqual([]);
    expect(ask.types).not.toContain('finish');

    // The line is named as the person named the avatar (kcxz.29, D12).
    expect(answer.data).toEqual([
      {
        type: 'data-avatar',
        data: { kind: 'avatar', id: 'a1', name: 'Игорь' },
        transient: false,
      },
    ]);
    // Readiness was asked before the card; the card came only then (D7).
    expect(run.reads).toContain('VoiceService.activationBlocker');
    expect(answer.outputs).toEqual([
      {
        toolName: 'avatar_activate',
        output: expect.objectContaining({ ok: true, summary: { avatarId: 'a1', activated: true } }),
      },
    ]);
    expect(run.writes).toEqual([['avatar.activated', 'a1', 'assist']]);
    expect(run.world.avatars[0]).toMatchObject({ id: 'a1', active: true, name: 'Игорь' });
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['agent', 'agent', 'user-1', 'succeeded'],
    ]);
  },
};
