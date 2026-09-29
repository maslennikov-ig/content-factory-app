'use strict';

/**
 * The key shapes (`secret-shapes.ts`, review W3-20 F4, F11, F12): what the
 * chat door, the conductor's processors, the MCP adapter and the composer take
 * out, what they leave, and that the file stays import-free — the browser
 * bundle imports it.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const FILE = 'libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts';
const shapes = loadTypeScriptModule(FILE);

describe('key shapes (review W3-20 F4)', () => {
  test.each([
    ['an Exa key (a UUID) after «exa»', 'вот ключ exa: 5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', 'вот ключ exa: [KEY]'],
    ['an Exa key before «ключ»', '5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f — это ключ', '[KEY] — это ключ'],
    ['an API key word in English', 'my api key 5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', 'my api key [KEY]'],
    ['Resend', 'RESEND: re_AbC12345_XyZ67890abcdefGHIJ', 'RESEND: [KEY]'],
    ['xAI', 'xai-AbCdEf0123456789AbCdEf0123456789', '[KEY]'],
    ['Groq', 'gsk_AbCdEf0123456789AbCdEf0123456789', '[KEY]'],
    ['Google API', 'AIzaSyA-0123456789abcdefghijklmnopqrstu', '[KEY]'],
    ['Google OAuth', 'ya29.a0AfH6SMBx-0123456789abcdefghij', '[KEY]'],
    ['glued after `_`', 'KEY_sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE2222', 'KEY_[KEY]'],
    ['glued after a word', 'ключ:tvly-dev-FAKEFAKEFAKEFAKE2222', 'ключ:[KEY]'],
    ['glued after letters', 'xsk-ab12cd34ef56gh78ij90kl12mn34op56qr', 'x[KEY]'],
    ['an OpenAI project key glued to letters', 'KEYsk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123', 'KEY[KEY]'],
    ['a key broken by a line break', 'sk-or-v1-0123456789abcdef01234567\n89abcdef0123456789abcdef then text', '[KEY] then text'],
    ['a key broken by a space', 'tvly-dev-FAKEFAKE0000FAKE 1111FAKE2222 ок', '[KEY] ок'],
    ['a Telegram bot token', '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-ts', '[KEY]'],
    // MCP OAuth tokens (kcxz.26): access, refresh, code.
    ['an MCP access token', 'токен mcpa_Xk3v9QpL0aZ-7yN2bR8sT1uV4wE6fG5hJ_cD0eIoKmM', 'токен [KEY]'],
    ['an MCP refresh token', 'mcpr_Xk3v9QpL0aZ-7yN2bR8sT1uV4wE6fG5hJ_cD0eIoKmM', '[KEY]'],
    ['an MCP code', 'code=mcpc_Xk3v9QpL0aZ-7yN2bR8sT1uV4wE6fG5hJ_cD0eIoKmM', 'code=[KEY]'],
  ])('%s is redacted', (_name, text, redacted) => {
    expect(shapes.redactSecretShapes(text)).toBe(redacted);
    expect(shapes.containsSecretShape(text)).toBe(true);
  });

  test.each([
    ['a product id alone', 'удали пост 5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f сегодня'],
    ['an id beside a JSON field named key', '{"key":"piece","id":"5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f"}'],
    ['a link with an `/sk-…` path segment (F11)', 'https://site.ru/sk-rosatom-news-2026-09-28-x'],
    ['an id:slug (F11)', 'смотри 12345678:some-long-slug-of-words-for-the-post'],
    ['a code prefix', 'используем re_match_pattern_for_text_lines'],
    ['a slug with sk- inside a word', 'task-management-software-guide-2026 is here'],
    ['ordinary words', 'cnt-12 piece p1 https://t.me/channel sk-8 модель'],
    ['an MCP client id and a short mcpa_ word', 'client mcp_AbCdEf0123456789AbCdEf01 and mcpa_note'],
  ])('%s is left alone', (_name, text) => {
    expect(shapes.redactSecretShapes(text)).toBe(text);
    expect(shapes.containsSecretShape(text)).toBe(false);
  });

  test('a key followed by words: the words stay', () => {
    expect(shapes.withoutSecretShapes('вот ключ sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE4444 поставь please')).toBe(
      'вот ключ поставь please'
    );
  });

  test('every string leaf of a structure is redacted, the shape kept', () => {
    expect(
      shapes.redactSecretLeaves({ a: ['x gsk_AbCdEf0123456789AbCdEf0123456789'], b: 3, c: { d: 'ok' } })
    ).toEqual({ a: ['x [KEY]'], b: 3, c: { d: 'ok' } });
  });

  test('whose key it is, by the prefix (F2)', () => {
    expect(
      ['sk-or-v1-x', 'sk-proj-x', 'sk-legacy', 'sk-ant-api03-x', 'tvly-dev-x', 'gsk_x', 'xai-x', 'AIzaX', 're_X', 'custom'].map(
        shapes.keyOwnerOf
      )
    ).toEqual(['openrouter', 'openai', 'openai', 'anthropic', 'tavily', 'groq', 'xai', 'google', 'resend', null]);
  });

  test('the file imports nothing: the browser bundle imports it (F12)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', FILE), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/^\s*export\s+(?:\*|\{[^}]*\})\s+from\s/m);
  });
});
