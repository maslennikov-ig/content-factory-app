const {Readable}=require('node:stream');
const { createServer } = require('node:http');
const TelegramBotSdk = require('node-telegram-bot-api');
const providerDiagnostic=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/provider-error-diagnostic.ts');
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
    './telegram-formatting':require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/telegram-formatting.ts'),
    './provider-error-diagnostic':providerDiagnostic,
    './media-upload-sources':{openMediaUploadStreams:async paths=>({sources:paths.map(()=>({stream:Readable.from(['synthetic-media'])})),close:()=>{}})},
  '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface': {},
  '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
  '@contentfactory/nestjs-libraries/services/redact.sensitive': { redactSensitive: (x) => x },
  '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {}, BadBody:class extends Error{constructor(id,json,body,message){super(message);}},RefreshToken:class extends Error{} },
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
  await expect(new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: html, media: [] }])).rejects.toThrow('результат запроса не подтверждён');
  expect(request).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
});

test('native rich posts send an ordered photo collage in one multipart request', async () => {
  const message = {
    id: 'p',
    settings: { telegramFormat: 'rich' },
    message: stripHtmlValidation('html', html),
    media: [{ path: 'https://cdn.example/picker.png' }, { path: 'https://cdn.example/diagram.png' }],
  };
  const result = await new TelegramProvider().post('channel', '-100123', [message]);
  expect(result[0]).toMatchObject({ postId: '42', releaseURL: 'https://t.me/channel/42' });
  expect(request).toHaveBeenCalledTimes(1);
  const [method, { formData }] = request.mock.calls[0];
  expect(method).toBe('sendRichMessage');
  expect(formData.chat_id).toBe('-100123');
  expect(JSON.parse(formData.rich_message)).toEqual({
    html: html.replace('<strong>', '<b>').replace('</strong>', '</b>') +
      '<tg-collage><img src="tg://photo?id=photo_0"/><img src="tg://photo?id=photo_1"/></tg-collage>',
    media: [
      { id: 'photo_0', media: { type: 'photo', media: 'attach://photo_0' } },
      { id: 'photo_1', media: { type: 'photo', media: 'attach://photo_1' } },
    ],
  });
  expect(formData.photo_0).toEqual({ value: expect.any(Readable), options: { filename: 'picker.png', contentType: 'image/png' } });
  expect(formData.photo_1.options.filename).toBe('diagram.png');
  expect(sendPhoto).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
});

test('Telegram SDK sends the rich message and both photo streams on the wire', async () => {
  let received;
  const server = createServer(async (req, res) => {
    try {
      const form = await new Response(Readable.toWeb(req), {
        headers: { 'content-type': req.headers['content-type'] },
      }).formData();
      received = {
        path: req.url,
        chatId: form.get('chat_id'),
        message: JSON.parse(form.get('rich_message')),
        files: await Promise.all(['photo_0', 'photo_1'].map(async key => {
          const file = form.get(key);
          return [file.name, await file.text()];
        })),
      };
      res.end(JSON.stringify({ ok: true, result: { message_id: 101 } }));
    } catch {
      res.writeHead(400).end(JSON.stringify({ ok: false, description: 'Invalid multipart' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const sdk = new TelegramBotSdk('fixture-token', {
      baseApiUrl: `http://127.0.0.1:${server.address().port}`,
    });
    request.mockImplementationOnce((method, options) => sdk._request(method, options));
    const result = await new TelegramProvider().post('channel', '-100123', [{
      id: 'p',
      settings: { telegramFormat: 'rich' },
      message: html,
      media: [{ path: '/uploads/picker.png' }, { path: '/uploads/diagram.png' }],
    }]);
    expect(result[0].releaseURL).toBe('https://t.me/channel/101');
    expect(received).toMatchObject({
      path: '/botfixture-token/sendRichMessage',
      chatId: '-100123',
      files: [['picker.png', 'synthetic-media'], ['diagram.png', 'synthetic-media']],
    });
    expect(received.message.html).toContain('<ol><li>Первый</li><li>Второй</li></ol>');
    expect(received.message.media.map(({ media }) => media.media)).toEqual([
      'attach://photo_0', 'attach://photo_1',
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('media retains its caption and readable structure without a second post', async () => {
  await new TelegramProvider().post('channel', '-100123', [{ id: 'p', message: html, media: [{ path: 'https://cdn.example/a.jpg' }] }]);
  expect(sendPhoto).toHaveBeenCalledWith('-100123', expect.any(Readable), expect.objectContaining({ caption: '<b>Заголовок</b>\n\nПервый абзац\nВторая строка\n\n• <b>Один</b>\n• Два\n\n1. Первый\n2. Второй\n' }), expect.anything());
  expect(request).not.toHaveBeenCalled();
});

test('editor paragraphs inside list items do not insert false blank items', () => {
  expect(telegramHtml('<ol><li><p>Раз</p></li><li><p>Два</p></li></ol>')).toBe('1. Раз\n2. Два\n');
});

test.each(['plain','rich','media'])('published %s content is sent unchanged without reaching stdout',async kind=>{
 const authored='PRIVATE_EDITORIAL_SENTINEL_4b7a';
 const message=kind==='rich'?`<h1>${authored}</h1><p>Body</p>`:authored;
 const logs=jest.spyOn(console,'log').mockImplementation(()=>{});
 const warnings=jest.spyOn(console,'warn').mockImplementation(()=>{});
 const errors=jest.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const result=await new TelegramProvider().post('channel','-100123',[{id:'saved-post',message,media:kind==='media'?[{path:'https://cdn.example/p.png'}]:[]}]);
  expect(JSON.stringify([...sendMessage.mock.calls,...sendPhoto.mock.calls,...request.mock.calls])).toContain(authored);
  expect(JSON.stringify([...logs.mock.calls,...warnings.mock.calls,...errors.mock.calls])).not.toContain(authored);
  expect(result[0]).toMatchObject({id:'saved-post',status:'completed'});expect(result[0].postId).toBeTruthy();
 }finally{logs.mockRestore();warnings.mockRestore();errors.mockRestore();}
});
