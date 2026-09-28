'use strict';

/**
 * An avatar from a Telegram export, chat only (`kcxz.18`, spec §2 A1): the
 * avatar is created, the export attached in the chat goes to its samples from
 * the browser (the composer's upload — here `before`, as the door would store
 * it) and the message carries only the receipt; the analysis is paid and
 * admits its own operations; the proposal opens as the avatar card; the
 * person's own line is saved verbatim; switching on waits for their consent.
 */
const AVATAR = '00000000-0000-4000-8000-000000000100';
const POST_TEXT = 'Текст поста из экспорта, который модель видеть не должна.';

module.exports = {
  id: 'avatar-telegram-export',
  title: 'Аватар из экспорта Telegram — образцы мимо модели, разбор, предложение, согласие',
  covers: ['avatar.create', 'avatar.overview', 'avatar.analyse', 'avatar.proposal', 'avatar.proposal.field', 'avatar.activate'],
  world: { avatars: [] },
  turns: [
    {
      say: 'Соберём аватар',
      model: [
        [['tool', 'avatar_create', {}]],
        [['text', 'Аватар создан. Приложите экспорт своего канала из Telegram — result.json.']],
      ],
    },
    {
      say: 'Вот мой канал',
      samples: {
        avatarId: AVATAR,
        files: ['result.json'],
        accepted: 3,
        refused: [{ reason: 'TOO_SHORT', count: 2 }],
        telegram: [{ name: 'result.json', selected: 3, eligible: 5 }],
      },
      // What the composer's upload through `POST …/samples/files` stored.
      before: (rows) => {
        rows.avatars[0].samples = [1, 2, 3].map((n) => ({
          id: `s-t${n}`,
          code: `smp-0${n}`,
          title: `Пост ${n}`,
          origin: 'TELEGRAM_EXPORT',
          usagePurpose: 'OWN_VOICE',
          charCount: 600,
          text: POST_TEXT,
        }));
      },
      model: [
        [['tool', 'avatar_overview', { avatarId: AVATAR }]],
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['text', 'Взяли три поста, два коротких пропустили. Предложение голоса готово — оно рядом.']],
      ],
    },
    {
      say: 'Тон подходит. Кто говорит — я, Игорь, основатель студии',
      model: [
        [['tool', 'avatar_proposal', { avatarId: AVATAR }]],
        [
          [
            'tool',
            'avatar_proposal_field',
            { avatarId: AVATAR, field: 'WHO_SPEAKS', action: 'save', text: 'Я, Игорь, основатель студии' },
          ],
        ],
        [['tool', 'avatar_activate', { avatarId: AVATAR, mode: 'assist' }]],
      ],
    },
    { resume: { consentGiven: true, avatarName: 'Игорь' }, model: [[['text', 'Аватар включён.']]] },
  ],
  check: (run) => {
    const [create, upload, decide, consent] = run.turns;

    // Created and shown as the avatar card; the first avatar is the default.
    expect(create.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, kind: 'person', isDefault: true },
      card: { kind: 'avatar', id: AVATAR },
    });

    // The model read the receipt as data — and not a word of the export.
    const read = run.prompts.filter((prompt) => prompt.turn === 1).map((prompt) => prompt.user);
    expect(read.length).toBeGreaterThan(0);
    for (const text of read) {
      expect(text).toContain('Вот мой канал');
      expect(text).toContain('"samplesUpload"');
      expect(text).toContain('"uploaded-file"');
      expect(text).not.toContain(POST_TEXT);
    }

    // Where it stands, then the paid analysis — once, with its own rows.
    expect(upload.outputs[0].output.summary).toMatchObject({
      avatarId: AVATAR,
      resumeAt: 'samples',
      samples: { ready: true, sampleCount: 3 },
    });
    expect(upload.outputs[1].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, outcome: 'proposal', spent: true, sampleCount: 3 },
      card: { kind: 'avatar', id: AVATAR },
    });
    expect(run.requests.filter(([name]) => name === 'voice.analysis')).toEqual([
      ['voice.analysis', AVATAR, { language: 'ru', withAssist: true }],
    ]);
    const stages = upload.data.filter((part) => part.type === 'data-progress');
    expect(stages.map((part) => part.data.stage)).toEqual([
      'voice-started',
      'voice-started',
      'voice-measured',
      'voice-call',
    ]);
    expect(stages.every((part) => part.transient)).toBe(true);
    expect(upload.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);

    // The person's words verbatim, then the consent card — nothing on yet.
    expect(run.requests.filter(([name]) => name === 'voice.proposal.field')).toEqual([
      ['voice.proposal.field', AVATAR, { key: 'WHO_SPEAKS', action: 'SAVE', text: 'Я, Игорь, основатель студии' }],
    ]);
    // The lines are the person's and the AI's words: the model reads them as data.
    expect(decide.outputs[0].output.summary.untrustedData.value).toMatchObject({
      outcome: 'ready',
      mode: 'assist',
      portrait: true,
      grounds: 2,
    });
    expect(decide.suspended).toHaveLength(1);
    expect(decide.suspended[0].payload).toMatchObject({ avatarId: AVATAR, mode: 'assist', canDecideForPerson: false });

    expect(consent.outputs[0].output).toMatchObject({ ok: true, summary: { avatarId: AVATAR, activated: true } });
    expect(run.writes).toEqual([
      ['avatar.created', AVATAR, 'PERSON'],
      ['avatar.measured', AVATAR, 3],
      ['avatar.proposed', AVATAR],
      ['avatar.proposal.field', AVATAR, 'WHO_SPEAKS', 'SAVE'],
      ['avatar.activated', AVATAR, 'assist'],
    ]);
    expect(run.world.avatars[0]).toMatchObject({ id: AVATAR, active: true, name: 'Игорь' });
    // The thread keeps the receipt as the files' line and the avatar card.
    expect(run.storedPartTypes).toContain('data-avatar');
    expect(run.storedPartTypes).not.toContain('data-progress');
  },
};
