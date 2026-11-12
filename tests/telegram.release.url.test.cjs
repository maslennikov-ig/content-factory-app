const {Readable}=require('node:stream');
const providerDiagnostic=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/provider-error-diagnostic.ts');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

let nextMessageId = 42;
const sendPhoto = jest.fn(async () => ({ message_id: nextMessageId++ }));
class TelegramBot {
  sendMessage = async () => ({ message_id: nextMessageId++ });
  sendPhoto = sendPhoto;
}

const { TelegramProvider } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts',
  {
    './telegram-formatting': require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/telegram-formatting.ts'),
    './provider-error-diagnostic':providerDiagnostic,
    './media-upload-sources':{openMediaUploadStreams:async paths=>({sources:paths.map(()=>({stream:Readable.from(['synthetic-media'])})),close:()=>{}})},
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
      {},
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    // Covered by `telegram.log.redaction.test.cjs`; identity here keeps these
    // assertions about the release URL.
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      SocialAbstract: class {}, BadBody:class extends Error{constructor(id,json,body,message){super(message);}},RefreshToken:class extends Error{},
    },
    'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
  }
);

const post = { id: 'draft-1', message: 'Text', media: [] };

describe('Telegram release URLs', () => {
  beforeEach(() => {
    nextMessageId = 42;
  });

  test('uses the public username when one exists', async () => {
    const [result] = await new TelegramProvider().post(
      'public_channel',
      '-1001234567890',
      [post]
    );

    expect(result.releaseURL).toBe('https://t.me/public_channel/42');
  });

  test('uses Telegram’s private-channel c path for a numeric internal id', async () => {
    const [result] = await new TelegramProvider().post(
      '-1001234567890',
      '-1001234567890',
      [post]
    );

    expect(result.releaseURL).toBe('https://t.me/c/1234567890/42');
  });

  test('uses the same private-channel path for comments', async () => {
    const [result] = await new TelegramProvider().comment(
      '-1001234567890',
      '41',
      undefined,
      '-1001234567890',
      [post],
      {}
    );

    expect(result.releaseURL).toBe('https://t.me/c/1234567890/42');
  });
});

describe('Telegram text budget', () => {
  test('a single picture turns the text into a caption with its own shorter limit', async () => {
    const provider = new TelegramProvider();

    await provider.post('public_channel', '-1001234567890', [
      {
        ...post,
        message: 'Caption text',
        media: [{ type: 'image', path: 'https://cdn.example/photo.jpg' }],
      },
    ]);

    expect(sendPhoto).toHaveBeenCalledWith(
      '-1001234567890',
      expect.any(Readable),
      expect.objectContaining({ caption: 'Caption text' }),
      expect.anything()
    );
    expect(provider.maxCaptionLength()).toBe(1024);
    expect(provider.maxCaptionLength()).toBeLessThan(provider.maxLength());
  });
});
