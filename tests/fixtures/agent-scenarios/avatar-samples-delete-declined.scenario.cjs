'use strict';

/** Without «Да» nothing is deleted: «Нет» leaves the samples as they were. */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-samples-delete-declined',
  title: 'Удаление образцов — «Нет» ничего не удаляет',
  covers: ['avatar.samples.delete'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: true,
        active: true,
        samples: [{ id: 's-1', code: 'smp-01', title: 'Пост 1', origin: 'PASTE', charCount: 600 }],
      },
    ],
  },
  turns: [
    { say: 'Удали smp-01', model: [[['tool', 'avatar_samples_delete', { codes: ['smp-01'] }]]] },
    { approve: false, model: [[['text', 'Хорошо, оставили.']]] },
    { say: 'А что с образцами?', model: [[['text', 'Образец smp-01 на месте.']]] },
  ],
  check: (run) => {
    expect(run.turns[0].approvals).toHaveLength(1);
    expect(run.writes).toEqual([]);
    expect(run.reads).not.toContain('VoiceService.deleteSamples');
    expect(run.world.avatars[0].samples).toHaveLength(1);
    // W3 walk P3-K: the model read what «Нет» means in the server's words —
    // not «the approval was not given», which it turned into «подтвердите там».
    expect(run.turns[1].readDecline).toBe(true);
    // Review F9: that note is the «Нет» request's own; the thread keeps only
    // the fact, so a later message does not read «do not offer it again».
    expect(run.turns[2].readDecline).toBe(false);
    expect(run.storedDecline).toEqual({ fact: true, note: false });
  },
};
