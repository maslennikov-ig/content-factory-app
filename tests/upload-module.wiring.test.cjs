require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `UploadModule` lists `CustomFileValidationPipe` as a provider, so Nest
 * constructs it once at boot. When `content-factory-next-fn33.20` gave the
 * pipe a `locale` constructor parameter, every unit test stayed green and the
 * backend refused to start: Nest looked for a provider of `String`. A green
 * unit proves the unit, never the wiring — this suite boots the provider the
 * way the application does.
 */
const loadPipe = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/upload/custom.upload.validation.ts',
    {
      'file-type': {
        fromBuffer: async () => ({ mime: 'image/png', ext: 'png' }),
      },
    }
  );

describe('the upload validation pipe is constructible by Nest', () => {
  test('a module that lists the pipe as a provider compiles', async () => {
    const { CustomFileValidationPipe } = loadPipe();
    const moduleRef = await Test.createTestingModule({
      providers: [CustomFileValidationPipe],
    }).compile();

    const pipe = moduleRef.get(CustomFileValidationPipe);
    expect(pipe).toBeInstanceOf(CustomFileValidationPipe);
    // The default language survives injection: nothing was injected for it.
    expect(pipe.locale).toBe('en');
  });
});
