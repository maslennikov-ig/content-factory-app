const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { editorHtml } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts');
const { stripHtmlValidation } = loadTypeScriptModule('libraries/helpers/src/utils/strip.html.validation.ts');
const { PostPreview } = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/pieces/post-preview.tsx');
const request = jest.fn();
const sendMessage = jest.fn();
const sendPhoto = jest.fn();
class TelegramBot { _request = request; sendMessage = sendMessage; sendPhoto = sendPhoto; }
const filename = path.resolve(__dirname, '../libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
const mocks = {
  '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface': {},
  '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
  '@contentfactory/nestjs-libraries/services/redact.sensitive': { redactSensitive: (x) => x },
  '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {} },
  'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
};
const loaded = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(loaded.exports, (name) => mocks[name] || require(name), loaded, filename, path.dirname(filename));
const { TelegramProvider, telegramHtml } = loaded.exports;
const source = '# Заголовок\n\nПервый абзац\nВторая строка\n\n- **Один**\n- Два\n\n1. Первый\n2. Второй';
const html = '<h1>Заголовок</h1><p>Первый абзац<br>Вторая строка</p><ul><li><strong>Один</strong></li><li>Два</li></ul><ol><li>Первый</li><li>Второй</li></ol>';

beforeEach(() => { jest.clearAllMocks(); request.mockResolvedValue({ message_id: 42 }); sendMessage.mockResolvedValue({ message_id: 43 }); sendPhoto.mockResolvedValue({ message_id: 44 }); });

test('shared rendering preserves paragraphs, lines and structured blocks in the preview', () => {
  expect(editorHtml(source, 'html')).toBe(html);
  const preview = renderToStaticMarkup(React.createElement(PostPreview, { locale: 'ru', channelName: 'Канал', platform: 'telegram', text: source, image: null, time: null, draftId: 'x' }));
  expect(preview).toContain('Заголовок');
  expect(preview).toContain('<ul');
  expect(preview).toContain('<ol');
  expect(preview).toContain('<strong>Один</strong>');
  expect(preview).toContain('Первый абзац\nВторая строка');
});

test('preview uses the caption heading for attachments and leaves other platforms unchanged', () => {
  const props = { locale: 'ru', channelName: 'Канал', text: '# Тема\n\n- Один', time: null, draftId: 'x' };
  const caption = renderToStaticMarkup(React.createElement(PostPreview, { ...props, platform: 'telegram', image: { path: '/image.png' } }));
  expect(caption).toContain('<strong>Тема</strong>');
  expect(caption).not.toContain('cf-heading-md');
  const other = renderToStaticMarkup(React.createElement(PostPreview, { ...props, platform: 'x', image: null }));
  expect(other).toContain('# Тема');
  expect(other).toContain('- Один');
});

test('legacy posts keep blank paragraph separators and source lines', async () => {
  const content = editorHtml('Один\nстрока\n\nДва', 'html');
  expect(telegramHtml(content)).toBe('Один\nстрока\n\nДва\n');
  await new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: content, media: [] }]);
  expect(sendMessage).toHaveBeenCalledWith('-100123', 'Один\nстрока\n\nДва\n', { parse_mode: 'HTML' });
  expect(request).not.toHaveBeenCalled();
});

test('structured text is sent once through rich messages with sanitized HTML', async () => {
  await new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: stripHtmlValidation('html', html), media: [] }]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('sendRichMessage', { form: { chat_id: '-100123', rich_message: JSON.stringify({ html: html.replace('<strong>', '<b>').replace('</strong>', '</b>') }) } });
  expect(sendMessage).not.toHaveBeenCalled();
});

test('a failed rich request is propagated without an uncertain retry', async () => {
  request.mockRejectedValueOnce(new Error('network failure'));
  await expect(new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: html, media: [] }])).rejects.toThrow('network failure');
  expect(request).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
});

test('media retains its caption and readable structure without a second post', async () => {
  await new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: html, media: [{ path: 'https://cdn.example/a.jpg' }] }]);
  expect(sendPhoto).toHaveBeenCalledWith('-100123', 'https://cdn.example/a.jpg', expect.objectContaining({ caption: '<b>Заголовок</b>\n\nПервый абзац\nВторая строка\n\n• <b>Один</b>\n• Два\n\n1. Первый\n2. Второй\n' }), expect.anything());
  expect(request).not.toHaveBeenCalled();
});

test('editor paragraphs inside list items do not insert false blank items', () => {
  expect(telegramHtml('<ol><li><p>Раз</p></li><li><p>Два</p></li></ol>')).toBe('1. Раз\n2. Два\n');
});
