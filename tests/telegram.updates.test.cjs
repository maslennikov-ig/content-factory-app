const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(
  __dirname,
  '../libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts'
);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(
  loaded.exports,
  require,
  loaded
);
const { parseTelegramUpdate } = loaded.exports;

describe('Telegram update routing', () => {
  test('turns an anonymous reaction update into one absolute total', () => {
    expect(
      parseTelegramUpdate({
        update_id: 101,
        message_reaction_count: {
          chat: { id: -10020 },
          message_id: 42,
          reactions: [{ total_count: 3 }, { total_count: 2 }],
        },
      })
    ).toEqual([
      {
        kind: 'reaction-count',
        chatId: '-10020',
        messageId: '42',
        total: 5,
      },
    ]);
  });

  test('routes a connection command without giving the endpoint its own poller', () => {
    expect(
      parseTelegramUpdate({
        update_id: 102,
        channel_post: {
          chat: { id: -10020 },
          message_id: 43,
          text: '/connect safe_word-1',
        },
      })
    ).toEqual([
      {
        kind: 'connect',
        word: 'safe_word-1',
        chatId: '-10020',
        messageId: '43',
      },
    ]);
  });

  test('maps an automatic discussion forward back to its channel post', () => {
    expect(
      parseTelegramUpdate({
        update_id: 103,
        message: {
          chat: { id: -10030 },
          message_id: 8,
          is_automatic_forward: true,
          forward_origin: {
            type: 'channel',
            chat: { id: -10020 },
            message_id: 42,
          },
        },
      })
    ).toEqual([
      {
        kind: 'discussion-forward',
        channelChatId: '-10020',
        channelMessageId: '42',
        discussionChatId: '-10030',
        discussionMessageId: '8',
      },
    ]);
  });

  test('routes every reply through its parent mapping so nested comments count', () => {
    expect(
      parseTelegramUpdate({
        update_id: 104,
        message: {
          chat: { id: -10030 },
          message_id: 10,
          reply_to_message: { message_id: 9 },
          text: 'Nested comment',
        },
      })
    ).toEqual([
      {
        kind: 'discussion-reply',
        discussionChatId: '-10030',
        discussionMessageId: '10',
        parentDiscussionMessageId: '9',
      },
    ]);
  });
});
