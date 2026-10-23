require('reflect-metadata');
const { Global, Module } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const fixture = require('./helpers/video-domain-v1.fixture.cjs');

const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const integration = databaseUrl ? test : test.skip;

integration('actual shared VideoModule initializes through Nest DI and recovers a persisted pending job', async () => {
  const f = await fixture.create(databaseUrl);
  let context;
  try {
    const ready = await f.ready();
    const pending = await f.service.launch(f.org.id, f.user.id, ready.launch);
    const starts = [];
    const temporal = {
      client: { getRawClient: () => ({ workflow: {
        start: async (...args) => { starts.push(args); return {}; },
      } }) },
    };
    // Only the inherited donor providers and the external text client boundary
    // are substituted. Every new VideoModule provider is its actual source.
    const { VideoModule } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/videos/video.module.ts',
      {
        '@contentfactory/nestjs-libraries/videos/images-slides/images.slides': { ImagesSlides: class ImagesSlides {} },
        '@contentfactory/nestjs-libraries/videos/veo3/veo3': { Veo3: class Veo3 {} },
        '../openai/ai.clients': {
          getModelForRole: () => { throw new Error('Text preparation is outside the startup check'); },
          getOpenAiClient: () => { throw new Error('Text preparation is outside the startup check'); },
        },
      }
    );
    const registrations = Reflect.getMetadata('providers', VideoModule);
    const registeredClass = (name) => {
      const target = registrations.find((entry) => typeof entry === 'function' && entry.name === name);
      expect(target).toBeDefined();
      return target;
    };
    const Job = registeredClass('VideoJobService');
    const Repository = registeredClass('VideoGenerationRepository');
    const Credentials = registeredClass('VideoCredentialsService');
    const Execution = registeredClass('VideoExecutionV1');
    const Recovery = registeredClass('VideoExecutionRecoveryV1');
    const dependencies = (target) => Reflect.getMetadata('design:paramtypes', target);
    const prismaToken = dependencies(Repository)[0];
    const usageToken = dependencies(Job)[2];
    const temporalToken = dependencies(Execution)[0];
    expect(prismaToken.name).toBe('PrismaService');
    expect(usageToken.name).toBe('AiUsageService');
    expect(temporalToken.name).toBe('TemporalService');
    const globals = [
      { provide: prismaToken, useValue: f.db },
      { provide: usageToken, useValue: f.service.usage },
      { provide: temporalToken, useValue: temporal },
    ];
    class SyntheticInfrastructureModule {}
    Global()(SyntheticInfrastructureModule);
    Module({ providers: globals, exports: globals.map((provider) => provider.provide) })(SyntheticInfrastructureModule);

    context = await Test.createTestingModule({
      imports: [SyntheticInfrastructureModule, VideoModule],
    }).compile();
    await context.init();

    const jobs = context.get(Job);
    expect(jobs).toBeInstanceOf(Job);
    expect(jobs).not.toBe(f.service);
    expect(await jobs.get(f.org.id, pending.id)).toMatchObject({ id: pending.id, state: 'accepted' });
    expect(await context.get(Credentials).getSettings(f.org.id)).toMatchObject({
      usageMode: 'workspace_key', effective: { higgsfield: { available: true } },
    });
    for (const name of ['VideoManager', 'VideoMediaV1', 'HiggsfieldProviderV1', 'HeygenProviderV1']) {
      const target = registeredClass(name);
      expect(context.get(target)).toBeInstanceOf(target);
    }
    const port = registrations.find((entry) => entry?.useExisting === Execution);
    expect(port).toBeDefined();
    expect(context.get(port.provide)).toBe(context.get(Execution));
    expect(context.get(Recovery)).toBeInstanceOf(Recovery);
    expect(starts).toContainEqual(['videoGenerationWorkflowV1', {
      workflowId: `video-v1:${pending.id}`, taskQueue: 'main',
      args: [{ organizationId: f.org.id, jobId: pending.id }],
      workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
    }]);
    expect(f.transport.submits).toHaveLength(0);
    expect(await f.db.videoGenerationJob.count({ where: { organizationId: f.org.id } })).toBe(1);
  } finally {
    // Native Nest shutdown clears the actual recovery interval.
    if (context) await context.close();
    await f.close();
  }
}, 30_000);
