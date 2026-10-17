'use strict';

const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const INITIAL_TONE = 'Спокойно и по делу.';
const MANUAL_TONE = 'Ручная правка: точно, спокойно, без пафоса.';
const UPDATED_TONE = `${MANUAL_TONE} Всегда отделять факт от предположения.`;
const passport = {
  whoSpeaks: 'Редактор', tone: INITIAL_TONE, audience: 'Руководители команд',
  sentenceStyle: 'Короткие фразы', neverSay: ['мы лучшие'], topics: 'Практика; разборы',
  addressForm: 'vy', delegatedPolicy: 'knowledge', versionLabel: 'v1',
  activeSince: '01.01.2026',
};

module.exports = {
  id: 'avatar-passport-parity',
  title: 'Действующий паспорт: чат читает свежую ручную правку и добавляет правило через ту же дверь',
  covers: ['avatar.passport', 'avatar.passport.field'],
  world: {
    avatars: [{
      id: AVATAR, name: 'Редактор', kind: 'PERSON', isDefault: true,
      analysed: true, active: true, samples: [], manual: {}, fields: [],
      passport: { ...passport }, passportVersionNumber: 1,
    }],
  },
  turns: [
    {
      say: 'Прочитай действующий тон аватара «Редактор».',
      model: [
        [['tool', 'avatar_passport', { avatarId: AVATAR }]],
        [['text', INITIAL_TONE]],
      ],
    },
    {
      // The manual card saved v2 after the preceding chat turn. The new turn
      // must read that active value, not its old tool result or empty draft.
      before: (rows) => {
        const avatar = rows.avatars.find((one) => one.id === AVATAR);
        avatar.passport = { ...avatar.passport, tone: MANUAL_TONE, versionLabel: 'v2' };
        avatar.passportVersionNumber = 2;
      },
      say: 'Я изменил тон вручную. Прочитай его заново и добавь правило: «Всегда отделять факт от предположения». Остальное сохрани.',
      model: [
        [['tool', 'avatar_passport', { avatarId: AVATAR }]],
        [['tool', 'avatar_passport_field', { avatarId: AVATAR, field: 'TONE', text: UPDATED_TONE }]],
        [['tool', 'avatar_passport', { avatarId: AVATAR }]],
        [['text', 'Сохранил ручную формулировку и добавил правило. Действующий паспорт обновлён.']],
      ],
    },
  ],
  check: (run) => {
    const [initial, edited] = run.turns;
    const value = (entry) => entry.output.summary.untrustedData.value;
    expect(value(initial.outputs[0])).toMatchObject({ avatarId: AVATAR, versionLabel: 'v1' });
    expect(value(initial.outputs[0]).fields.find((field) => field.key === 'TONE').text).toBe(INITIAL_TONE);
    expect(edited.outputs.map(({ toolName }) => toolName)).toEqual([
      'avatar_passport', 'avatar_passport_field', 'avatar_passport',
    ]);
    expect(edited.outputs.every(({ output }) => output.ok)).toBe(true);
    expect(value(edited.outputs[0])).toMatchObject({ avatarId: AVATAR, versionLabel: 'v2' });
    expect(value(edited.outputs[0]).fields.find((field) => field.key === 'TONE').text).toBe(MANUAL_TONE);
    for (const entry of edited.outputs.slice(1)) {
      expect(value(entry)).toMatchObject({ avatarId: AVATAR, versionLabel: 'v3' });
      expect(value(entry).fields.find((field) => field.key === 'TONE').text).toBe(UPDATED_TONE);
    }
    expect(run.world.avatars[0].passport).toEqual({ ...passport, tone: UPDATED_TONE, versionLabel: 'v3' });
    expect(run.world.avatars[0].manual).toEqual({});
    expect(run.reads).not.toContain('VoiceService.manualProposal');
    expect(run.reads).not.toContain('VoiceService.proposal');
    expect(run.reads).not.toContain('VoiceService.activateProposal');
    expect(run.requests.filter(([name]) => name.startsWith('voice.'))).toEqual([
      ['voice.passport', AVATAR], ['voice.passport', AVATAR],
      ['voice.passport.field', AVATAR, { key: 'TONE', text: UPDATED_TONE }],
      ['voice.passport', AVATAR],
    ]);
    expect(run.writes).toEqual([['avatar.passport.field', AVATAR, 'TONE']]);
    expect(run.pending).toBe(0);
    expect(run.turns.every((turn) => turn.suspended.length === 0)).toBe(true);
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'], ['agent', 'agent', 'user-1', 'succeeded'],
    ]);
  },
};
