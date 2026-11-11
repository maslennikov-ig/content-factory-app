'use strict';

const connectionId = '77777777-7777-4777-8777-777777777777';
const input = { connectionId, avatarId: 'owned-avatar', groupId: 'owned-group' };
const say = 'Покажите ссылку на согласие для моего аватара.';
const name = 'Тестовый аватар';
const expiresAt = '2030-01-02T00:00:00.000Z';

module.exports = {
  id: 'heygen-avatar-consent',
  title: 'Согласие открывается в браузере по карточке исходного чата',
  covers: ['video.avatar_consent_status', 'video.avatar_consent_request'],
  services: () => ({
    VideoAccessService: {
      async avatarConsentStatus(org, actor, selected) {
        if (org !== 'org-1' || actor !== 'user-1' || selected.avatarId !== input.avatarId) throw new Error('Unexpected avatar.');
        return { ...input, name, consentState: 'pending', renderQualified: false };
      },
      async requestAvatarConsent(org, actor, threadId, author, selected) {
        if (org !== 'org-1' || actor !== 'user-1' || author.text !== say || selected.groupId !== input.groupId) throw new Error('Unexpected consent scope.');
        return { handle: 'a'.repeat(64), ownerThreadId: threadId, name, state: 'ready', expiresAt, renderQualified: false };
      },
    },
  }),
  turns: [{ say, model: [[['tool', 'video_avatar_consent_status', input]], [['tool', 'video_avatar_consent_request', input]]] }],
  check(run) {
    const [turn] = run.turns;
    expect(turn.outputs.map(({ toolName, output }) => [toolName, output.ok])).toEqual([
      ['video_avatar_consent_status', true], ['video_avatar_consent_request', true],
    ]);
    expect(turn.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'data-heygen-consent', data: expect.objectContaining({ name, expiresAt, threadId: run.threadId }) }),
    ]));
    expect(turn.outputs[1].output.summary.untrustedData.value).toMatchObject({state: 'ready', renderQualified: false});
    expect(turn.outputs[1].output.card).toEqual({kind: 'heygen-consent', id: 'a'.repeat(64)});
  },
};
