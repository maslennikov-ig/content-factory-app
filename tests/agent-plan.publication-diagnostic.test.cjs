const {
  IDENTITY,
  executeTool,
  fixtures,
  loadRegistry,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { PUBLICATION_UNCERTAIN_V106 } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/publication-store.v106.ts'
);
const { publicPendingProviderDiagnosticTextV110 } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/provider-error-diagnostic.ts'
);
const registry = loadRegistry();

test('calendar agent exposes static persisted reasons and no-resend guidance while omitting raw historical errors', async () => {
  const fixture = fixtures()['plan.calendar'];
  const reason = publicPendingProviderDiagnosticTextV110({
    provider: 'meta',
    code: 'rate_limit',
  });
  const error = `${PUBLICATION_UNCERTAIN_V106}\n${reason}`;
  fixture.services.PostsService.getPosts = async () => [
    {
      id: 'known',
      publishDate: '2026-09-29T09:00:00Z',
      state: 'ERROR',
      error,
      integration: {
        id: 'channel',
        name: 'Synthetic',
        providerIdentifier: 'instagram',
      },
    },
    {
      id: 'unknown',
      publishDate: '2026-09-29T10:00:00Z',
      state: 'ERROR',
      error: 'Bearer private-provider-token private-caption',
      integration: {
        id: 'channel',
        name: 'Synthetic',
        providerIdentifier: 'instagram',
      },
    },
  ];
  const tool = registry.buildCapabilityTool(
    registry.CAPABILITY_CATALOGUE.find((one) => one.id === 'plan.calendar'),
    {
      services: servicesFrom(fixture.services),
      language: 'ru',
      entrance: 'chat',
    }
  );
  const context = requestContextFor(registry, {
    ...IDENTITY,
    role: 'ADMIN',
    timeZone: 'Europe/Moscow',
  });
  const { output } = await executeTool(tool, fixture.input, {
    requestContext: context,
  });
  expect(output.ok).toBe(true);
  const serialized = JSON.stringify(output);
  expect(serialized).toContain('площадка сообщила об ограничении запросов');
  expect(serialized).toContain(
    'автоматическая повторная отправка заблокирована'
  );
  expect(serialized).not.toMatch(
    /private-provider-token|private-caption|повторите попытку/
  );
});
