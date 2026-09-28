'use strict';

const contract = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.contract.ts'
);

/**
 * «Подключим Telegram» from the chat (kcxz.19): the approval card says what
 * connecting means; after «Да» the chat draws the onboarding's three steps
 * as a card — the word, the nonce and the polling stay in the browser, the
 * model hears only that the card is shown. The polling ends in the connect
 * door saving the channel (played here as the channel appearing between two
 * requests); the next turn reads it from the workspace and opens it.
 */
const NEW_CHANNEL = {
  id: 'c2',
  name: 'Заметки из цеха',
  providerIdentifier: 'telegram',
  disabled: false,
  refreshNeeded: false,
  planMode: 'reserve',
  posts: 0,
  profile: null,
};

module.exports = {
  id: 'channel-telegram-connect',
  title: '«Подключим Telegram» — карточка с «Да», шаги онбординга, канал появился и открыт',
  role: 'ADMIN',
  covers: ['channel.connect', 'channel.open'],
  turns: [
    { say: 'Подключим Telegram', model: [[['tool', 'channel_connect', { provider: 'telegram' }]]] },
    {
      approve: true,
      model: [[['text', 'Добавьте бота администратором и отправьте в канал команду с карточки — канал появится сам.']]],
    },
    {
      // The person did the three steps; the page's polling found the chat and
      // the connect door saved the channel.
      before: (rows) => {
        rows.channels.push({ ...NEW_CHANNEL });
      },
      say: 'Готово, отправил команду',
      model: [[['tool', 'channel_open', { channelId: 'c2' }]], [['text', 'Канал «Заметки из цеха» подключён, режим — «Бронь».']]],
    },
  ],
  check: (run) => {
    const [ask, yes, done] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'channel_connect',
        reason:
          'Подключить Telegram-канал к пространству: вы добавите нашего бота администратором канала, и посты отсюда смогут выходить в этот канал',
      }),
    ]);
    // Nothing ran before «Да».
    expect(ask.outputs).toEqual([]);

    // «Да»: the steps card, with the channels already there; the model reads
    // no word, no nonce, no address.
    expect(yes.outputs[0].output).toEqual({
      ok: true,
      capability: 'channel.connect',
      summary: {
        provider: 'telegram',
        flow: 'telegram',
        shown: 'card',
        next: 'The person follows the card; wait for them to say it is done.',
      },
      card: { kind: 'channel-connect', id: 'telegram' },
    });
    expect(yes.data).toEqual([
      {
        type: 'data-channel-connect',
        data: { kind: 'channel-connect', id: 'telegram', provider: 'telegram', name: 'Telegram', flow: 'telegram', known: ['c1'], since: expect.any(String) },
        transient: false,
      },
    ]);
    expect(JSON.stringify(yes.outputs)).not.toMatch(/connect [a-z]|nonce|url/i);
    // The screen draws the steps card, not a «Готово» line, live and reloaded.
    const blocks = (messages) =>
      messages
        .filter((message) => message.role === 'assistant')
        .flatMap((message) => contract.readMessageBlocks(message));
    const live = blocks(yes.client.messages);
    expect(live.filter((block) => block.type === 'connect')).toEqual([
      expect.objectContaining({
        connect: { provider: 'telegram', name: 'Telegram', flow: 'telegram', known: ['c1'], since: expect.any(String) },
      }),
    ]);
    expect(live.filter((block) => block.type === 'done' && block.toolName === 'channel_connect')).toEqual([]);
    const reloaded = blocks(contract.readThreadHistory(run.history).messages);
    expect(reloaded.filter((block) => block.type === 'connect')).toHaveLength(1);
    expect(run.storedPartTypes).toContain('data-channel-connect');

    // The polling's result: the new channel is in the workspace, opened beside the chat.
    expect(done.outputs[0].output).toMatchObject({
      ok: true,
      card: { kind: 'channel', id: 'c2' },
      summary: {
        untrustedData: {
          value: expect.objectContaining({ channelId: 'c2', platform: 'telegram', planMode: 'reserve', state: 'active' }),
        },
      },
    });
    expect(done.data).toEqual([
      { type: 'data-channel', data: { kind: 'channel', id: 'c2', name: 'Заметки из цеха', provider: 'telegram' }, transient: false },
    ]);
    // The chat itself wrote nothing: the connect door did.
    expect(run.writes).toEqual([]);
  },
};
