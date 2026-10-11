const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const valid = {
  REDIS_URL: 'redis://127.0.0.1:6379',
  DATABASE_URL: 'postgresql://fixture@127.0.0.1:5432/fixture',
  JWT_SECRET: 'offline-only-fixture',
  MAIN_URL: 'https://offline.invalid',
  FRONTEND_URL: 'https://offline.invalid',
  NEXT_PUBLIC_BACKEND_URL: 'https://offline.invalid/api',
  BACKEND_INTERNAL_URL: 'http://127.0.0.1:3000',
  STORAGE_PROVIDER: 'local',
};
const keys = Object.keys(valid);
describe('offline configuration strict mode', () => {
  let env, exitCode;
  beforeEach(() => {
    env = { ...process.env };
    exitCode = process.exitCode;
    for (const key of keys) delete process.env[key];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = env;
    process.exitCode = exitCode;
    jest.restoreAllMocks();
  });
  function task() {
    return new (loadTypeScriptModule(
      'apps/commands/src/tasks/configuration.ts'
    ).ConfigurationTask)();
  }
  test('invalid legacy report still succeeds', () => {
    expect(task().create()).toBe(true);
    expect(process.exitCode).toBe(exitCode);
  });
  test('invalid strict report returns failure and exit 1', () => {
    expect(task().create(true)).toBe(false);
    expect(process.exitCode).toBe(1);
  });
  test('valid strict report succeeds', () => {
    Object.assign(process.env, valid);
    expect(task().create(true)).toBe(true);
    expect(process.exitCode).toBe(exitCode);
  });
});
