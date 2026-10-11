const { inspect } = require('node:util');
const { HttpException } = require('@nestjs/common');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const recipient = 'private-recipient-sentinel@example.invalid';
const subject = 'private-subject-sentinel';
const content = 'private-content-sentinel';
const cookie = 'private-cookie-sentinel';
const privateValues = [recipient, subject, content, cookie];
const privateError = () => Object.assign(new Error(privateValues.join(' ')), {
  name: cookie, code: recipient, response: { body: content, headers: { cookie } },
});
const nest = { Injectable: () => target => target, HttpException };
const emailInterface = loadTypeScriptModule('libraries/nestjs-libraries/src/emails/email.interface.ts');
const { EmailSendError } = emailInterface;
let logs, environment;

beforeEach(() => {
  logs = [];
  for (const level of ['log', 'error', 'warn', 'info', 'debug']) {
    jest.spyOn(console, level).mockImplementation((...args) => logs.push({ level, args }));
  }
  environment = { ...process.env };
  Object.assign(process.env, {
    EMAIL_PROVIDER: '', EMAIL_FROM_NAME: content,
    EMAIL_FROM_ADDRESS: recipient, FRONTEND_URL: 'https://example.invalid',
  });
});
afterEach(() => {
  process.env = environment;
  jest.restoreAllMocks();
});

function assertPrivateValuesAbsent() {
  const output = inspect(logs, { depth: null });
  for (const value of privateValues) expect(output.includes(value)).toBe(false);
}
function records(event) {
  return logs.filter(row => row.args[0] === event).map(row => row.args[1]);
}
function assertCorrelation(events) {
  expect(events.length).toBeGreaterThan(0);
  const ids = events.map(event => event.correlationId);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(new Set(ids).size).toBe(1);
}
function mailFixture() {
  class EmptyProvider { name = 'no provider'; validateEnvKeys = []; async sendEmail() { return privateValues.join(' '); } }
  const waits = jest.fn(async () => {});
  const { EmailService } = loadTypeScriptModule('libraries/nestjs-libraries/src/services/email.service.ts', {
    '@nestjs/common': nest,
    '@contentfactory/nestjs-libraries/emails/email.interface': emailInterface,
    '@contentfactory/nestjs-libraries/emails/resend.provider': { ResendProvider: class {} },
    '@contentfactory/nestjs-libraries/emails/node.mailer.provider': { NodeMailerProvider: class {} },
    '@contentfactory/nestjs-libraries/emails/empty.provider': { EmptyProvider },
    '@contentfactory/helpers/utils/timer': { timer: waits },
  });
  const service = new EmailService({});
  const send = jest.fn(async () => ({ to: recipient, subject, html: content, response: { cookie } }));
  service.emailService = { name: cookie, validateEnvKeys: [], sendEmail: send };
  return { service, send, waits, EmailService };
}
const sendMail = service => service.sendEmailSync(recipient, subject, `<p>${content}</p>`, recipient, 'ru');

test('mail success omits recipient/content/provider result and preserves delivery arguments', async () => {
  const { service, send } = mailFixture();
  await expect(sendMail(service)).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(1);
  const [to, title, html, fromName, fromAddress, replyTo] = send.mock.calls[0];
  expect([to, title, fromName, fromAddress, replyTo]).toEqual([recipient, subject, content, recipient, recipient]);
  expect(html).toContain(content);
  assertPrivateValuesAbsent();
  expect(records('email.sent')[0].attempt).toBe(1);
  assertCorrelation(records('email.sent'));
});

test.each(['error', 'object', 'string'])('mail exhausted retries preserve the original %s failure, without logging it', async kind => {
  const { service, send, waits } = mailFixture();
  const failure = kind === 'error' ? privateError() : kind === 'object' ? { message: content, cookie, recipient } : content;
  send.mockRejectedValue(failure);
  await expect(sendMail(service)).rejects.toBe(failure);
  expect(send).toHaveBeenCalledTimes(3);
  expect(waits.mock.calls).toEqual([[700], [700]]);
  assertPrivateValuesAbsent();
  expect(records('email.attempt_failed').map(row => row.attempt)).toEqual([1, 2, 3]);
  expect(records('email.failed')[0]).toMatchObject({ attempts: 3, code: 'provider_failure', retryable: true });
  assertCorrelation([...records('email.attempt_failed'), ...records('email.failed')]);
});

test('mail permanent failure is visible and stops after one attempt', async () => {
  const { service, send, waits } = mailFixture();
  const failure = new EmailSendError(privateValues.join(' '), false);
  send.mockRejectedValue(failure);
  await expect(sendMail(service)).rejects.toBe(failure);
  expect(send).toHaveBeenCalledTimes(1);
  expect(waits).not.toHaveBeenCalled();
  assertPrivateValuesAbsent();
  expect(records('email.failed')[0]).toMatchObject({ attempts: 1, code: 'non_retryable_failure', retryable: false });
  assertCorrelation([...records('email.attempt_failed'), ...records('email.failed')]);
});

test('mail succeeds after a transient failure, with one correlation across attempts', async () => {
  const { service, send, waits } = mailFixture();
  send.mockRejectedValueOnce(privateError());
  await sendMail(service);
  expect(send).toHaveBeenCalledTimes(2);
  expect(waits.mock.calls).toEqual([[700]]);
  expect(records('email.failed')).toHaveLength(0);
  assertPrivateValuesAbsent();
  expect(records('email.sent')[0].attempt).toBe(2);
  assertCorrelation([...records('email.attempt_failed'), ...records('email.sent')]);
});

test('malformed recipient is rejected before provider and is absent from logs and error text', async () => {
  const { service, send } = mailFixture();
  await expect(service.sendEmailSync(content, subject, cookie)).rejects.toThrow(/not a valid email address/);
  try { await service.sendEmailSync(content, subject, cookie); } catch (error) {
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain(content);
  }
  expect(send).not.toHaveBeenCalled();
  assertPrivateValuesAbsent();
  expect(records('email.failed')[0].code).toBe('invalid_recipient');
});

test('missing sender rejects before provider, with safe configuration diagnosis', async () => {
  const { service, send } = mailFixture();
  delete process.env.EMAIL_FROM_ADDRESS;
  await expect(sendMail(service)).rejects.toThrow(/EMAIL_FROM_ADDRESS/);
  expect(send).not.toHaveBeenCalled();
  assertPrivateValuesAbsent();
  expect(records('email.failed')[0].code).toBe('sender_not_configured');
});

test('disabled mail remains a no-op and never logs its payload-containing empty-provider result', async () => {
  const { EmailService } = mailFixture();
  const service = new EmailService({});
  await sendMail(service);
  expect(records('email.sent')).toHaveLength(0);
  expect(records('email.skipped')[0].code).toBe('provider_not_configured');
  assertPrivateValuesAbsent();
  assertCorrelation(records('email.skipped'));
});

test('invalid provider configuration warns without echoing arbitrary configuration contents', () => {
  const { EmailService } = mailFixture();
  process.env.EMAIL_PROVIDER = privateValues.join(' ');
  new EmailService({});
  assertPrivateValuesAbsent();
  expect(logs.some(row => row.level === 'error' && inspect(row.args).includes('not a known email provider'))).toBe(true);
});

test('independent mail operations receive different opaque correlations', async () => {
  const { service } = mailFixture();
  await sendMail(service); await sendMail(service);
  const events = records('email.sent');
  expect(events).toHaveLength(2);
  expect(events[0].correlationId).not.toBe(events[1].correlationId);
  assertPrivateValuesAbsent();
});

function mediaFixture() {
  class SubscriptionException extends HttpException { constructor() { super('limit reached', 406); } }
  const storage = { uploadSimple: jest.fn(async () => 'https://example.invalid/video.mp4') };
  const repository = { saveFile: jest.fn(async () => ({ id: 'saved' })) };
  const credits = { checkCredits: jest.fn(async () => ({ credits: 1 })), useCredit: jest.fn(async (_org, _type, run) => run()) };
  const instance = { processAndValidate: jest.fn(async () => {}), process: jest.fn(async () => content) };
  const manager = { getVideoByName: jest.fn(() => ({ trial: true, instance })) };
  const { MediaService } = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/media.service.ts', {
    '@nestjs/common': nest,
    '@contentfactory/nestjs-libraries/database/prisma/media/media.repository': { MediaRepository: class {} },
    '@contentfactory/nestjs-libraries/openai/openai.service': { OpenaiService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/videos/video.manager': { VideoManager: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => storage } },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
      AuthorizationActions: { Create: 'create' }, Sections: { VIDEOS_PER_MONTH: 'videos' }, SubscriptionException,
    },
  });
  const service = new MediaService(repository, {}, credits, manager);
  const org = { id: recipient, isTrailing: false };
  const body = { type: cookie, output: 'horizontal', customParams: { prompt: content, cookie, nested: { recipient, subject } } };
  return { service, org, body, storage, repository, credits, instance, manager };
}

test('video success retains parameters, credit and storage behavior, logs only safe completion', async () => {
  const { service, org, body, instance, credits, storage, repository } = mediaFixture();
  await expect(service.generateVideo(org, body)).resolves.toEqual({ id: 'saved' });
  expect(instance.processAndValidate).toHaveBeenCalledWith(body.customParams);
  expect(instance.process).toHaveBeenCalledWith(org.id, body.output, body.customParams);
  expect(credits.useCredit).toHaveBeenCalledWith(org, 'ai_videos', expect.any(Function));
  expect(storage.uploadSimple).toHaveBeenCalledWith(content);
  expect(repository.saveFile).toHaveBeenCalledWith(org.id, 'video.mp4', 'https://example.invalid/video.mp4', undefined);
  assertPrivateValuesAbsent();
  expect(records('video.generated')).toHaveLength(1);
  assertCorrelation(records('video.generated'));
});

test.each(['credits', 'validation', 'process', 'upload', 'save'])('video %s failure is diagnosed without leaking the failing payload', async phase => {
  const { service, org, body, instance, credits, storage, repository } = mediaFixture();
  const target = { credits: credits.checkCredits, validation: instance.processAndValidate, process: instance.process, upload: storage.uploadSimple, save: repository.saveFile }[phase];
  target.mockRejectedValue(privateError());
  await expect(service.generateVideo(org, body)).rejects.toThrow('AI generation failed');
  if (phase === 'validation') {
    expect(instance.process).not.toHaveBeenCalled();
    expect(credits.useCredit).not.toHaveBeenCalled();
  }
  assertPrivateValuesAbsent();
  expect(records('video.generated')).toHaveLength(0);
  expect(records('video.failed')[0].code).toBe('generation_failed');
  assertCorrelation(records('video.failed'));
});

test.each(['limit', 'unknown_type', 'trial'])('video %s rejection retains the existing refusal without exposing request identifiers', async reason => {
  const { service, org, body, credits, manager, instance } = mediaFixture();
  if (reason === 'limit') credits.checkCredits.mockResolvedValue({ credits: 0 });
  if (reason === 'unknown_type') manager.getVideoByName.mockReturnValue(undefined);
  if (reason === 'trial') { org.isTrailing = true; manager.getVideoByName.mockReturnValue({ trial: false, instance }); }
  try { await service.generateVideo(org, body); throw new Error('expected rejection'); }
  catch (error) { expect(error.getStatus()).toBe(reason === 'unknown_type' ? 500 : 406); }
  expect(instance.process).not.toHaveBeenCalled();
  assertPrivateValuesAbsent();
  expect(records('video.generated')).toHaveLength(0);
  assertCorrelation(records('video.failed'));
});

test('video intentional HTTP errors retain their identity while the log omits response content', async () => {
  const { service, org, body, instance } = mediaFixture();
  const failure = new HttpException({ message: content, cookie }, 422);
  instance.processAndValidate.mockRejectedValue(failure);
  await expect(service.generateVideo(org, body)).rejects.toBe(failure);
  assertPrivateValuesAbsent();
  expect(records('video.failed')[0].code).toBe('generation_failed');
});

test('video success waits for file persistence', async () => {
  const { service, org, body, repository } = mediaFixture();
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  repository.saveFile.mockImplementation(() => { started(); return new Promise(resolve => { finish = resolve; }); });
  const pending = service.generateVideo(org, body);
  await ready;
  expect(records('video.generated')).toHaveLength(0);
  finish({ id: 'saved' });
  await pending;
  expect(records('video.generated')).toHaveLength(1);
  assertPrivateValuesAbsent();
});

test('slide video provider never logs generated media URLs while still assembling the video', async () => {
  const imageUrl = 'https://example.invalid/' + cookie;
  const audioUrl = 'https://example.invalid/' + recipient;
  const createAssembly = jest.fn(async () => ({ results: { subtitled: [{ url: 'https://example.invalid/video.mp4' }] } }));
  jest.spyOn(global, 'fetch').mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  const { ImagesSlides } = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/images-slides/images.slides.ts', {
    '@contentfactory/nestjs-libraries/openai/openai.service': { OpenaiService: class {} },
    '@contentfactory/nestjs-libraries/openai/fal.service': { FalService: class {} },
    '@contentfactory/nestjs-libraries/videos/video.interface': {
      VideoAbstract: class {}, Video: () => target => target, ExposeVideoFunction: () => () => {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({ uploadFile: async () => ({ path: audioUrl }) }) } },
    transloadit: class { createAssembly = createAssembly; },
    'music-metadata': { parseBuffer: async () => ({ format: { duration: 1 } }) },
    subtitle: { stringifySync: cues => JSON.stringify(cues) },
    'p-limit': () => run => run(),
    'class-validator': { IsString: () => () => {} },
    'class-validator-jsonschema': { JSONSchema: () => () => {} },
  });
  const generateSlidesFromText = jest.fn(async () => [{ imagePrompt: content, voiceText: subject }]);
  const generateImageFromText = jest.fn(async () => imageUrl);
  const provider = new ImagesSlides({ generateSlidesFromText }, { generateImageFromText });
  await expect(provider.process(recipient, 'horizontal', { prompt: content, voice: 'fake-voice' })).resolves.toBe('https://example.invalid/video.mp4');
  expect(generateSlidesFromText).toHaveBeenCalledWith(recipient, content);
  expect(createAssembly).toHaveBeenCalledTimes(1);
  const assembly = createAssembly.mock.calls[0][0];
  expect(assembly.params.steps.image0.url).toBe(imageUrl);
  expect(assembly.params.steps.audio0.url).toBe(audioUrl);
  expect(assembly.uploads['subtitles.srt']).toContain(subject);
  assertPrivateValuesAbsent();
});
