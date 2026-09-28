'use strict';

/**
 * An interrupted analysis continues without a second charge (`kcxz.18`, the
 * screen's rule from `2q28.34`): the chat left while the run was going, the
 * server finished and stored the proposal; «продолжи» finds it and pays for
 * nothing — the analysis door's generator is not even started.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const samples = [1, 2, 3].map((n) => ({
  id: `s-${n}`,
  code: `smp-0${n}`,
  title: `Пост ${n}`,
  origin: 'TELEGRAM_EXPORT',
  usagePurpose: 'OWN_VOICE',
  charCount: 600,
}));

module.exports = {
  id: 'avatar-analysis-resume',
  title: 'Прерванный разбор — продолжение без второй оплаты',
  covers: ['avatar.analyse'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: false,
        active: false,
        samples,
        // Stored by the run the chat left: these texts, with a proposal.
        run: { corpus: ['smp-01', 'smp-02', 'smp-03'], proposal: true, measuredAt: '2026-09-27T09:00:00.000Z' },
        fields: [{ key: 'TONE', text: 'Спокойно.', status: 'ACCEPTED' }],
      },
    ],
  },
  turns: [
    {
      say: 'Продолжи разбор',
      model: [
        [['tool', 'avatar_analyse', {}]],
        [['text', 'Разбор уже закончен — предложение голоса рядом, платить заново не пришлось.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, outcome: 'proposal', spent: false, sampleCount: 3 },
      card: { kind: 'avatar', id: AVATAR },
    });
    // No second run: the generator never started, no AI operation was opened.
    expect(run.reads).not.toContain('VoiceService.analysisStream');
    expect(run.requests.filter(([name]) => name === 'voice.analysis')).toEqual([]);
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(turn.data.filter((part) => part.type === 'data-progress')).toEqual([]);
    expect(run.writes).toEqual([]);
  },
};
