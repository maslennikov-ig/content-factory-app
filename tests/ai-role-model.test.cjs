'use strict';

/**
 * `content-factory-next-x63z`: a call names what it is for, not which model.
 *
 * Until this bead every text call in the product resolved to one configured
 * model, so classifying a single sentence cost what writing a whole draft
 * costs. The choice now happens in exactly one place — `modelFor(role, …)` in
 * `openai/ai.roles.ts` — and everything above it says a role.
 *
 * Three claims are held here:
 *
 *  - a role with a configured model gets it, and a role without one falls back
 *    to the workspace's text model (image roles to its image model);
 *  - what a workspace stores is read defensively: an unknown role, a number,
 *    a blank or an over-long id is dropped rather than sent to a provider;
 *  - `included` mode never spends the operator's key on a model the tenant
 *    named, exactly as it already refuses their `textModel`.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const ROLES = 'libraries/nestjs-libraries/src/openai/ai.roles.ts';
const CONFIG = 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts';

const roles = () => loadTypeScriptModule(ROLES);

const loadConfigModule = (stored) =>
  loadTypeScriptModule(CONFIG, {
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedDecryption: (value) => `plain:${value}` },
    },
  });

describe('modelFor', () => {
  test('a role with a configured model gets that model', () => {
    const { modelFor } = roles();
    expect(
      modelFor('classify', {
        textModel: 'text-default',
        imageModel: 'image-default',
        roleModels: { classify: 'cheap-classifier' },
      })
    ).toBe('cheap-classifier');
  });

  test('a role without one falls back to the workspace text model', () => {
    const { modelFor } = roles();
    expect(
      modelFor('draft', {
        textModel: 'text-default',
        imageModel: 'image-default',
        roleModels: { classify: 'cheap-classifier' },
      })
    ).toBe('text-default');
  });

  test('an image role falls back to the image model, not the text one', () => {
    const { modelFor } = roles();
    expect(
      modelFor('image', { textModel: 'text-default', imageModel: 'image-default' })
    ).toBe('image-default');
    expect(
      modelFor('image', {
        textModel: 'text-default',
        imageModel: 'image-default',
        roleModels: { image: 'named-image' },
      })
    ).toBe('named-image');
  });

  test('every declared role resolves to a model with nothing configured', () => {
    const { AI_ROLES, modelFor } = roles();
    expect(AI_ROLES.length).toBeGreaterThan(1);
    for (const role of AI_ROLES) {
      expect(
        modelFor(role, { textModel: 'text-default', imageModel: 'image-default' })
      ).toBeTruthy();
    }
  });

  test('an operation with no named role still resolves to one', () => {
    const { roleForOperation, isAiRole } = roles();
    for (const operation of [
      'text_generation',
      'image_generation',
      'web_research',
      'copilot_chat',
      'agent',
      'autopost',
      'content_classification',
      'brand_profile_assist',
      'something_added_later',
    ]) {
      expect(isAiRole(roleForOperation(operation))).toBe(true);
    }
    expect(roleForOperation('image_generation')).toBe('image');
  });
});

describe('parseRoleModels', () => {
  test('keeps known roles and trims the model id', () => {
    const { parseRoleModels } = roles();
    expect(parseRoleModels({ classify: '  cheap-classifier  ' })).toEqual({
      classify: 'cheap-classifier',
    });
  });

  test('drops an unknown role, a non-string and a blank', () => {
    const { parseRoleModels } = roles();
    expect(
      parseRoleModels({
        classify: 'cheap',
        not_a_role: 'anything',
        draft: 12,
        judge: '   ',
        image: null,
      })
    ).toEqual({ classify: 'cheap' });
  });

  test('drops an id longer than the stored ceiling instead of truncating it', () => {
    const { parseRoleModels, MAX_ROLE_MODEL_LENGTH } = roles();
    const tooLong = 'm'.repeat(MAX_ROLE_MODEL_LENGTH + 1);
    expect(parseRoleModels({ classify: tooLong })).toEqual({});
    expect(parseRoleModels({ classify: tooLong.slice(1) })).toEqual({
      classify: tooLong.slice(1),
    });
  });

  test('anything that is not an object reads as nothing configured', () => {
    const { parseRoleModels } = roles();
    for (const raw of [null, undefined, '', 'classify', 7, []]) {
      expect(parseRoleModels(raw)).toEqual({});
    }
  });
});

describe('loadAiConfig', () => {
  const workspaceRow = {
    usageMode: 'workspace_key',
    provider: 'openai',
    apiKey: 'stored-key',
    textModel: 'text-default',
    imageModel: 'image-default',
    roleModels: { classify: 'cheap-classifier', not_a_role: 'ignored' },
    searchEnabled: false,
  };

  test('a workspace key reads its own role models', async () => {
    const { loadAiConfig } = loadConfigModule();
    const config = await loadAiConfig('organization-a', async () => workspaceRow);
    expect(config.roleModels).toEqual({ classify: 'cheap-classifier' });
  });

  test('included mode ignores what the tenant named, like textModel', async () => {
    process.env.AI_INCLUDED_API_KEY = 'operator-key';
    try {
      const { loadAiConfig } = loadConfigModule();
      const config = await loadAiConfig('organization-a', async () => ({
        ...workspaceRow,
        usageMode: 'included',
      }));
      expect(config.roleModels).toEqual({});
      expect(config.textModel).not.toBe('');
    } finally {
      delete process.env.AI_INCLUDED_API_KEY;
    }
  });

  test('a workspace with no stored role models reads an empty map, never undefined', async () => {
    const { loadAiConfig } = loadConfigModule();
    const config = await loadAiConfig('organization-a', async () => ({
      ...workspaceRow,
      roleModels: null,
    }));
    expect(config.roleModels).toEqual({});
  });
});

describe('the active role travels with the admitted operation', () => {
  test('a client asked for no role gets the role of the operation it is inside', () => {
    const { withActiveAiConfig, getActiveAiRole } = loadConfigModule();
    const config = { textModel: 't', imageModel: 'i', roleModels: {} };
    expect(
      withActiveAiConfig('organization-a', config, () => getActiveAiRole(), 'classify')
    ).toBe('classify');
    // A nested re-entry without a role keeps the one already in flight rather
    // than silently falling back to the expensive default.
    expect(
      withActiveAiConfig('organization-a', config, () =>
        withActiveAiConfig('organization-a', config, () => getActiveAiRole())
      , 'classify')
    ).toBe('classify');
  });
});
