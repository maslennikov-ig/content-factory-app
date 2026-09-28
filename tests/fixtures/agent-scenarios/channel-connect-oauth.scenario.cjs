'use strict';

/**
 * Connecting a platform with a sign-in window (kcxz.19): after «Да» the card
 * carries only the platform and the flow; the browser asks the add-channel
 * door for the window's address and opens it, as «Каналы» does. A platform
 * that needs its own form (an instance address) is refused after «Да»: it is
 * connected on «Каналы».
 */
module.exports = {
  id: 'channel-connect-oauth',
  title: 'Подключение через окно площадки — кнопка на карточке; площадка с формой — на экране каналов',
  role: 'ADMIN',
  covers: ['channel.connect'],
  turns: [
    { say: 'Подключи LinkedIn', model: [[['tool', 'channel_connect', { provider: 'linkedin' }]]] },
    { approve: true, model: [[['text', 'Нажмите кнопку на карточке и разрешите доступ в окне LinkedIn.']]] },
    { say: 'И Mastodon', model: [[['tool', 'channel_connect', { provider: 'mastodon' }]]] },
    { approve: true, model: [[['text', 'Mastodon подключается на экране «Каналы».']]] },
  ],
  check: (run) => {
    const [ask, yes, askForm, yesForm] = run.turns;
    expect(ask.approvals[0].reason).toBe(
      'Подключить канал LinkedIn: откроется окно LinkedIn, где вы разрешите доступ, и посты отсюда смогут выходить в этот канал'
    );
    expect(yes.data).toEqual([
      {
        type: 'data-channel-connect',
        data: { kind: 'channel-connect', id: 'linkedin', provider: 'linkedin', name: 'LinkedIn', flow: 'oauth', known: [], since: expect.any(String) },
        transient: false,
      },
    ]);
    expect(askForm.approvals[0].reason).toBe('Mastodon подключается на экране «Каналы» — здесь ничего не подключится');
    expect(yesForm.outputs[0].output).toMatchObject({ ok: false, code: 'CHANNEL_CONNECT_ON_SCREEN' });
    expect(yesForm.data).toEqual([]);
    expect(run.writes).toEqual([]);
  },
};
