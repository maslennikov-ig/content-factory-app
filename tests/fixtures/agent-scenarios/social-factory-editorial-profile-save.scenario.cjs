'use strict';
const { profile, editorialAuthorityRows, summary } = require('./social-factory-editorial-authority-world.cjs');
module.exports = {
  id: 'social-factory-editorial-profile-save',
  title: 'Редактор сохраняет сообщённый профиль, а чтение показывает его как утверждение владельца',
  role: 'EDITOR',
  covers: ['channel.editorial_profile_save'],
  world: editorialAuthorityRows(),
  turns: [
    { say: 'Сохрани профиль моего канала: аудитория — редакторы небольших команд, польза — один практический редакционный приём. Цель — объяснять, свой опыт — редакционная работа, тема — проверка текста. Русский язык, географию не задаю.', model: [
      [['tool', 'channel_editorial_profile_save', { channelId: 'c1', expectedRevision: 0, profile: profile() }]],
      [['tool', 'channel_editorial_profile', { channelId: 'c1' }]],
      [['text', 'Профиль сохранён. Эти сведения сообщил владелец; независимого подтверждения здесь нет.']],
    ] },
  ],
  check(run) {
    const turn = run.turns[0], data = run.world.socialFactoryEditorialAuthority;
    expect(summary(turn, 'channel_editorial_profile_save')).toEqual({ channelId: 'c1', revision: 1, profile: profile() });
    const resolved = summary(turn, 'channel_editorial_profile');
    expect(resolved).toMatchObject({ revision: 1, profile: profile(), facts: expect.arrayContaining([{ key: 'audience', value: profile().audience, provenance: 'owner_asserted', scope: 'channel', evidenceIds: [] }]) });
    expect(resolved.facts.every(row => row.provenance !== 'verified')).toBe(true);
    expect(data.records).toHaveLength(1);
    expect(data.records[0]).toMatchObject({ organizationId: 'org-1', kind: 'channel_profile', id: 'c1', revision: 1, payload: { format: 'channel-profile-base/v1', profile: profile() } });
    expect(run.requests.filter(([name]) => name === 'profile.save')).toEqual([['profile.save', 'org-1', profile(), 0]]);
    expect(run.writes).toEqual([['profile.saved', 'org-1', 'c1', 1]]);
    expect(turn.approvals).toEqual([]);
    expect(run.world.channels).toHaveLength(1);
  },
};
