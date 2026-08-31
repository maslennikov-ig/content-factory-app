const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const consumers = [
  'apps/backend/src/api/routes/copilot.controller.ts',
  'libraries/nestjs-libraries/src/openai/openai.service.ts',
  'libraries/nestjs-libraries/src/openai/web.research.service.ts',
  'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
  'libraries/nestjs-libraries/src/agent/agent.graph.insert.service.ts',
  'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
  'libraries/nestjs-libraries/src/chat/load.tools.service.ts',
];

test('every direct AI consumer is behind the explicit operation seam', () => {
  for (const relative of consumers) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    expect({ relative, source }).toEqual(
      expect.objectContaining({
        relative,
        source: expect.stringMatching(
          /executeAi(?:Stream)?Operation|prepareModelExecution/
        ),
      })
    );
  }
});

test('client factories require an active operation context and tenant-bound memo identity', () => {
  const source = fs.readFileSync(
    path.join(root, 'libraries/nestjs-libraries/src/openai/ai.clients.ts'),
    'utf8'
  );

  expect(source).toContain('requireActiveAiConfig');
  expect(source).toMatch(/organizationId[\s\S]*usageMode[\s\S]*config\.apiKey/);
});

test('AI usage persistence is owned by the shared injected Prisma service', () => {
  const usage = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/openai/ai.usage.service.ts'
    ),
    'utf8'
  );
  const databaseModule = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/database.module.ts'
    ),
    'utf8'
  );

  expect(usage).toMatch(/@Injectable\(\)[\s\S]*class AiUsageService/);
  expect(usage).toMatch(/constructor\([^)]*PrismaService/);
  expect(usage).not.toMatch(/new PrismaClient|let prisma\s*:/);
  expect(databaseModule).toMatch(/providers:[\s\S]*AiUsageService/);
});

test('credential resolution borrows that pool instead of opening a second one', () => {
  const config = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/openai/ai.provider.config.ts'
    ),
    'utf8'
  );
  const usage = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/openai/ai.usage.service.ts'
    ),
    'utf8'
  );

  expect(config).not.toMatch(/new PrismaClient/);
  expect(config).not.toMatch(/^import[\s\S]*?from '@prisma\/client'/m);
  expect(config).toMatch(/export const setAiProviderSettingReader/);
  // The service that already holds the injected client is what lends it.
  expect(usage).toMatch(/setAiProviderSettingReader\(/);
});

test('image Credits wrap AI admission rather than being consumed after it', () => {
  const media = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/media/media.service.ts'
    ),
    'utf8'
  );
  const credit = media.indexOf('this._subscriptionService.useCredit(');
  const generation = media.indexOf('this._openAi.generateImage(', credit);

  expect(credit).toBeGreaterThan(-1);
  expect(generation).toBeGreaterThan(credit);
});
