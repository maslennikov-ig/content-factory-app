'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const files = {
  disclosure: 'apps/frontend/src/components/ui/disclosure.tsx',
  help: 'apps/frontend/src/components/help/help-disclosure.tsx',
  faq: 'apps/frontend/src/components/billing/faq.component.tsx',
  proposal: 'apps/frontend/src/components/brand-voice/voice-proposal.screen.tsx',
  avatars: 'apps/frontend/src/components/brand-voice/voice-avatars.screen.tsx',
  wizard: 'apps/frontend/src/components/brand-voice/voice-wizard.adapter.ts',
  assist: 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/assist.contract.ts',
  pipeline: 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/assist.pipeline.ts',
  service: 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts',
  directives: 'libraries/nestjs-libraries/src/agent/voice-directives.ts',
  intake: 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/file-intake.ts',
};

describe('third walk: one disclosure primitive', () => {
  test('the shared primitive owns disclosure state and all three consumers reuse it', () => {
    expect(fs.existsSync(path.join(root, files.disclosure))).toBe(true);
    expect(read(files.disclosure)).toMatch(/export (?:const|function) Disclosure/);
    for (const consumer of [files.help, files.faq, files.proposal]) {
      expect(read(consumer)).toContain("components/ui/disclosure");
    }
  });
});

describe('third walk: avatar proposal is useful without acceptance clicks', () => {
  test('V1 stays stable while V2 adds the grounded TOPICS field', () => {
    const contract = loadTypeScriptModule(files.assist);
    const pipeline = loadTypeScriptModule(files.pipeline);
    expect(contract.PROFILE_FIELDS).toEqual([
      'WHO_SPEAKS',
      'TONE',
      'AUDIENCE',
      'SENTENCE_LENGTH',
      'NEVER_SAY',
    ]);
    expect(contract.PROFILE_FIELDS_V2).toEqual([
      ...contract.PROFILE_FIELDS,
      'TOPICS',
    ]);

    const topic = {
      field: 'TOPICS',
      metric: null,
      quote: 'Пишем о поставках и сроках.',
      claim: 'Автор разбирает поставки и сроки.',
    };
    expect(() => contract.observationSchema.parse(topic)).toThrow();
    expect(contract.observationSchemaV2.parse(topic)).toEqual(topic);

    const sample = {
      code: 'smp-01',
      text: topic.quote,
      language: 'ru',
      contentHash: 'hash',
    };
    const measurement = { scales: {}, postHabits: null, postLayout: null };
    expect(pipeline.mapPrompt(sample, measurement, 'ru')).not.toContain('TOPICS');
    expect(pipeline.mapPromptV2(sample, measurement, 'ru')).toContain('TOPICS');
    expect(pipeline.reducePrompt([], 'ru')).not.toContain('TOPICS');
    expect(pipeline.reducePromptV2([], 'ru')).toContain('TOPICS');
  });

  test('new proposals arrive accepted and activation gates on portrait plus name', () => {
    const service = read(files.service);
    expect(service).toMatch(/status:\s*'ACCEPTED'/);
    const proposal = read(files.proposal);
    expect(proposal).toMatch(/!consentGiven\s*\|\|\s*!activationReady\s*\|\|\s*!named/);
    expect(proposal).not.toMatch(/disabled=\{[^}]*allAccepted/);
  });

  test('topics are saved into project goals and reach the generation directive', () => {
    expect(read(files.service)).toMatch(
      /const topics = text\('TOPICS'\);[\s\S]{0,200}contentGoals = topics/
    );
    expect(read(files.directives)).toMatch(/What they write about:/);
    expect(read(files.directives)).toMatch(/contentGoals/);
  });
});

describe('third walk: Telegram volume is a user choice', () => {
  test('multipart payload carries a bounded maxMessages value', () => {
    const { buildFilePayload } = loadTypeScriptModule(files.wizard);
    const payload = buildFilePayload(
      [new File(['{}'], 'result.json', { type: 'application/json' })],
      { rightsConfirmed: false, retentionUntil: '' },
      'own',
      'ru',
      180
    );
    expect(payload.get('maxMessages')).toBe('180');
  });

  test('the file parser passes maxMessages to Telegram selection', () => {
    expect(read(files.intake)).toMatch(
      /parseTelegramExport\([\s\S]{0,200}maxMessages:\s*options\.maxMessages/
    );
  });
});

describe('third walk: avatar list feedback is quiet and transient', () => {
  test('selection uses Toast, card click, and the existing kind explanation', () => {
    const avatars = read(files.avatars);
    expect(avatars).toContain("import { Toast }");
    expect(avatars).toContain('onMakeDefault?.(avatar.id)');
    expect(avatars).toContain('avatarsKindHint');
    expect(avatars).not.toContain('avatarsDefaultOverride');
  });
});
