'use strict';

/** The avatar's id: a UUID, as Prisma makes them (review W3-18 F10). */
const A1 = 'a1a1a1a1-0000-4000-8000-0000000000a1';

/**
 * Consent is the person's (the `input` class): the agent asks on a card,
 * waits, and switches the avatar on only with the person's answer.
 */
module.exports = {
  id: 'avatar-activate',
  title: 'Включение аватара — вопрос и продолжение',
  covers: ['avatar.activate'],
  world: {
    avatars: [{ id: A1, name: 'Черновик голоса', isDefault: true, analysed: true, kind: 'PERSON', active: false }],
  },
  turns: [
    {
      say: 'Включи аватар',
      model: [[['tool', 'avatar_activate', { avatarId: A1, mode: 'assist' }]]],
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
          avatarId: A1,
          mode: 'assist',
          // The name it has now and whose voice it is (W3 walk P3-F, P3-G):
          // the card's name field starts with it, the tick fits a person.
          avatarName: 'Черновик голоса',
          avatarKind: 'person',
          canDecideForPerson: false,
          // The card's id, sent back with the answer (review W2 F3).
          cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
        },
      },
    ]);
    // A named avatar is not asked for a name again.
    expect(ask.suspended[0].payload.question).not.toMatch(/дайте аватару имя/);
    // Nothing is switched on while the card waits.
    expect(ask.outputs).toEqual([]);
    expect(ask.types).not.toContain('finish');

    // The line is named as the person named the avatar (kcxz.29, D12).
    expect(answer.data).toEqual([
      {
        type: 'data-avatar',
        data: { kind: 'avatar', id: A1, name: 'Игорь' },
        transient: false,
      },
    ]);
    // Readiness was asked before the card; the card came only then (D7).
    expect(run.reads).toContain('VoiceService.activationBlocker');
    expect(answer.outputs).toEqual([
      {
        toolName: 'avatar_activate',
        output: expect.objectContaining({
          ok: true,
          summary: {
            avatarId: A1,
            activated: true,
            name: 'Игорь',
            // W3 recheck R-1: the answer says the consent is done, in words
            // the model can repeat, and forbids asking to confirm again.
            message: expect.stringContaining('nothing waits for a confirmation'),
          },
        }),
      },
    ]);
    expect(answer.outputs[0].output.summary.message).toContain('Аватар «Игорь» включён.');
    expect(answer.outputs[0].output.summary.message).toContain('Never ask them to confirm');
    // The instruction every turn reads says the same.
    expect(run.firstCall.system).toContain('A consent card the person answered is their consent');
    expect(run.writes).toEqual([['avatar.activated', A1, 'assist']]);
    expect(run.world.avatars[0]).toMatchObject({ id: A1, active: true, name: 'Игорь' });
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['agent', 'agent', 'user-1', 'succeeded'],
    ]);
  },
};
