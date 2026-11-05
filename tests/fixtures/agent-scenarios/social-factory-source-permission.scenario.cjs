'use strict';
const { permission, EXPIRES, editorialAuthorityRows, summary } = require('./social-factory-editorial-authority-world.cjs');
const unknown = permission({ sourceId: 'public-unknown' });
const owned = permission();
module.exports = {
  id: 'social-factory-source-permission',
  title: 'Даже подтверждённая карточка не создаёт права из публичности; известное разрешение сохраняется и отзывается',
  role: 'ADMIN',
  covers: ['source.permission_save', 'source.permission_revoke'],
  world: editorialAuthorityRows(),
  turns: [
    { say: 'Я утверждаю, что могу использовать страницу public-unknown для редакционной работы в c1 до 2099 года. Покажи точное разрешение; сервер должен проверить зарегистрированное подтверждение.', model: [[['tool', 'source_permission_save', unknown]]] },
    { approve: true, model: [[['text', 'Сохранение отклонено: зарегистрированные права неизвестны. Публичная страница не даёт разрешения.']]] },
    { say: 'Для registered-owned права уже подтверждены в реестре. Разрешаю редакционную работу только в c1 до указанного срока: это моя учебная памятка. Покажи карточку.', model: [[['tool', 'source_permission_save', owned]]] },
    { approve: true, model: [[['text', 'Сохранено только указанное редакционное разрешение.']]] },
    { say: 'Теперь отзови разрешение registered-owned первой версии.', model: [
      [['tool', 'source_permission_revoke', { sourceId: 'registered-owned', expectedRevision: 1 }]],
      [['text', 'Разрешение отозвано. Это не отменяет уже принятые внешние действия.']],
    ] },
  ],
  check(run) {
    const data = run.world.socialFactoryEditorialAuthority;
    for (const index of [0, 2]) {
      const turn = run.turns[index];
      expect(turn.outputs).toEqual([]); expect(turn.approvals).toHaveLength(1);
      expect(turn.approvals[0]).toMatchObject({ toolName: 'source_permission_save' });
    }
    expect(run.turns[1].outputs.find(row => row.toolName === 'source_permission_save').output).toMatchObject({ ok: false, code: 'SOCIAL_FACTORY_SOURCE_UNAVAILABLE' });
    expect(data.sources.find(row => row.id === 'public-unknown')).toMatchObject({ rightsState: 'UNKNOWN', rightsConfirmedAt: null, rightsConfirmedByUserId: null });
    expect(data.records.some(row => row.id === 'public-unknown')).toBe(false);
    expect(summary(run.turns[3], 'source_permission_save')).toMatchObject({ sourceId: 'registered-owned', revision: 1, permission: { organizationId: 'org-1', evidenceId: 'owner:user-1:registered-owned:1', basis: 'owned', origin: 'web', purposes: ['editorial'], channelIds: ['c1'], expiresAt: EXPIRES } });
    expect(data.records).toHaveLength(1);
    expect(data.records[0]).toMatchObject({ organizationId: 'org-1', kind: 'source_permission', id: 'registered-owned', revision: 2, payload: { revokedAt: expect.any(String) } });
    expect(run.requests.filter(([name]) => name === 'permission.save')).toEqual([['permission.save', 'org-1', 'user-1', unknown], ['permission.save', 'org-1', 'user-1', owned]]);
    expect(run.requests.filter(([name]) => name === 'permission.revoke')).toEqual([['permission.revoke', 'org-1', 'registered-owned', 1]]);
    expect(run.requests.filter(([name]) => name === 'source.assertChannel')).toEqual([['source.assertChannel', 'org-1', 'c1'], ['source.assertChannel', 'org-1', 'c1']]);
    expect(run.writes).toEqual([['permission.saved', 'org-1', 'user-1', 'registered-owned', 1], ['permission.revoked', 'org-1', 'registered-owned', 1]]);
    expect(data.invalidations).toEqual([['org-1', 'registered-owned'], ['org-1', 'registered-owned']]);
  },
};
