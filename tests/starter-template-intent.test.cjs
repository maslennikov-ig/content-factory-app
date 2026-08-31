const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const starterTemplateCatalog = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts'
);
const {
  REGISTRATION_INTENT_KEY,
  REGISTRATION_INTENT_TTL_MS,
  consumeRegistrationIntent,
  issueRegistrationIntent,
} = loadTypeScriptModule(
  'apps/frontend/src/components/public-saas/registration-intent.ts',
  {
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template':
      starterTemplateCatalog,
  }
);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

describe('OAuth starter-template registration intent', () => {
  test('stores only the allowlisted template and timestamp, then consumes it once', () => {
    const storage = memoryStorage();
    issueRegistrationIntent(storage, 'content-workflow', 1000);

    expect([...storage.values.keys()]).toEqual([REGISTRATION_INTENT_KEY]);
    expect(JSON.parse(storage.values.get(REGISTRATION_INTENT_KEY))).toEqual({
      version: 1,
      starterTemplate: 'content-workflow',
      issuedAt: 1000,
    });
    expect(consumeRegistrationIntent(storage, 1001)).toBe('content-workflow');
    expect(consumeRegistrationIntent(storage, 1002)).toBe('blank');
  });

  test.each([
    ['unsupported template', JSON.stringify({ version: 1, starterTemplate: 'evil', issuedAt: 1000 })],
    ['extra payload', JSON.stringify({ version: 1, starterTemplate: 'content-workflow', issuedAt: 1000, email: 'private@example.com' })],
    ['malformed JSON', '{'],
  ])('tampered %s safely falls back to blank and is removed', (_label, value) => {
    const storage = memoryStorage();
    storage.setItem(REGISTRATION_INTENT_KEY, value);

    expect(consumeRegistrationIntent(storage, 1001)).toBe('blank');
    expect(storage.getItem(REGISTRATION_INTENT_KEY)).toBeNull();
  });

  test('expired intent safely falls back to blank', () => {
    const storage = memoryStorage();
    issueRegistrationIntent(storage, 'content-workflow', 1000);

    expect(
      consumeRegistrationIntent(storage, 1000 + REGISTRATION_INTENT_TTL_MS + 1)
    ).toBe('blank');
    expect(storage.getItem(REGISTRATION_INTENT_KEY)).toBeNull();
  });

  test('unsupported values are stored as blank without arbitrary payload', () => {
    const storage = memoryStorage();
    issueRegistrationIntent(storage, 'tampered', 1000);
    expect(consumeRegistrationIntent(storage, 1001)).toBe('blank');
  });
});
