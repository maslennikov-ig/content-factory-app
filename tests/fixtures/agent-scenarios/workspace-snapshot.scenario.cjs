'use strict';

/**
 * The first turn of every conversation: the workspace is read once, before
 * the model, into the instruction as data; asked again as a tool it answers
 * the same rows, free.
 */
module.exports = {
  id: 'workspace-snapshot',
  title: 'Снимок области в начале хода и по запросу',
  covers: ['workspace.snapshot'],
  turns: [
    {
      say: 'Что у нас есть?',
      model: [
        [['tool', 'workspace_snapshot', {}]],
        [['text', 'У нас одна заготовка и один канал; аватар ещё не включён.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    // The snapshot opened the turn: inside the instruction, wrapped as data.
    const line = run.firstCall.system
      .split('\n')
      .find((candidate) => candidate.startsWith('{"untrustedData"'));
    const opening = JSON.parse(line).untrustedData.value;
    expect(opening).toMatchObject({
      // The counts of «С чего начать» (`OnboardingRepository.progress` over
      // the world's rows, kcxz.21): the draft avatar is not switched on, so it
      // is listed but not counted, and the avatar step is the one left first.
      counts: { channels: 1, avatars: 0, pieces: 1, planModes: 1 },
      onboarding: { done: ['channel', 'piece', 'plan'], next: 'avatar' },
      pieces: [{ id: 'p1', code: 'cnt-1', title: 'Про созвоны' }],
      channels: [{ id: 'c1', planMode: 'reserve' }],
      defaultAvatarId: 'a1',
      allowance: { mode: 'workspace_key' },
    });
    // The archived piece is not «in work».
    expect(JSON.stringify(opening)).not.toContain('cnt-0');

    // The tool answers the same rows, wrapped the same way; nothing written.
    const [output] = turn.outputs;
    expect(output.toolName).toBe('workspace_snapshot');
    expect(output.output.ok).toBe(true);
    expect(output.output.summary.untrustedData.value).toEqual(opening);
    expect(turn.data).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(turn.text).toBe('У нас одна заготовка и один канал; аватар ещё не включён.');
  },
};
