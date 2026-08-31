const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const telemetryFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/public-saas/public-telemetry.ts'
);

describe('public growth telemetry', () => {
  test('sends only the fixed anonymous coarse event contract', async () => {
    expect(fs.existsSync(telemetryFile)).toBe(true);
    const compiled = ts.transpileModule(
      fs.readFileSync(telemetryFile, 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2021,
        },
      }
    ).outputText;
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(
      (request) =>
        request === '@contentfactory/react/helpers/variable.context'
          ? { useVariables: () => ({ language: 'en' }) }
          : require(request),
      loaded,
      loaded.exports
    );
    const { publicGrowthEventPayload, sendPublicGrowthEvent } = loaded.exports;
    expect(
      publicGrowthEventPayload('demo_completed', 'ru', 721, 'schedule')
    ).toEqual({
      name: 'demo_completed',
      locale: 'ru',
      widthRange: 'medium',
      uiVersion: 'public-demo-v1',
      demoStep: 'schedule',
    });
    const fetcher = jest.fn(async () => ({ ok: true }));
    await sendPublicGrowthEvent(
      publicGrowthEventPayload('signup_started', 'de', 320),
      'https://api.content-factory.test',
      fetcher
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.content-factory.test/public-growth-events',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
      })
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({
      name: 'signup_started',
      locale: 'en',
      widthRange: 'small',
      uiVersion: 'public-demo-v1',
    });
    expect(JSON.stringify(body)).not.toMatch(
      /email|referrer|userAgent|visitor|href|width\b/i
    );
  });

  test('connects exactly the four public lifecycle events', () => {
    const read = (file) =>
      fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    expect(
      read('apps/frontend/src/components/public-saas/public-home.tsx')
    ).toContain("track('landing_view')");
    const demo = read(
      'apps/frontend/src/components/public-saas/synthetic-demo.tsx'
    );
    expect(demo).toContain("track('demo_started', 'plan')");
    expect(demo).toContain("track('demo_completed', 'schedule')");
    expect(
      read('apps/frontend/src/components/public-saas/email-first-signup.tsx')
    ).toContain("track('signup_started')");
  });
});
