'use strict';

/**
 * Guards of the agent's capability registry (`content-factory-next-kcxz.6`,
 * spec §4.2, §4.10, §5; premortem A1, A4, U1).
 *
 * Each rule is checked on the whole catalogue, so a capability added later is
 * held to it without anyone remembering to write a test. Where a rule is a
 * function of the registry (`assertCapabilityInput`), the test also shows that
 * the function refuses a declaration that breaks it — a guard that never
 * fails proves nothing.
 */

const { z } = require('zod');
const {
  INJECTION,
  IDENTITY,
  doors,
  fixtures,
  loadRegistry,
  providerConfig,
  servicesFrom,
  requestContextFor,
  executeTool,
  executeFixture,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const byClass = (risk) => catalogue.filter((capability) => capability.risk === risk);

describe('agent capability registry', () => {
  test('the catalogue passes its own registry check', () => {
    expect(() => registry.assertCapabilityRegistry(catalogue)).not.toThrow();
  });

  test('the first release proves every class a tool can carry', () => {
    const classes = new Set(catalogue.map((capability) => capability.risk));
    // `secret` since kcxz.20: the key card.
    for (const risk of ['read', 'write', 'paid', 'confirm', 'input', 'secret']) {
      expect(classes.has(risk)).toBe(true);
    }
  });

  test('every capability names a routed handler that exists, and every non-read one a handler with policies', () => {
    for (const capability of catalogue) {
      const { controller, method } = capability.door;
      const door = doors.find(
        (entry) => entry.controller === controller.name && entry.handler === method
      );
      expect({ id: capability.id, door: door ? 'found' : 'missing' }).toEqual({
        id: capability.id,
        door: 'found',
      });
      // Read from the metadata, exactly as `PoliciesGuard` reads it.
      const policies = registry.readDoorPolicies(capability.door);
      expect(policies.length).toBe(door.policies.length);
      if (capability.risk !== 'read') {
        expect({ id: capability.id, policies: policies.length > 0 }).toEqual({
          id: capability.id,
          policies: true,
        });
      }
    }
  });

  test('every capability has a risk class from spec §5.1', () => {
    for (const capability of catalogue) {
      expect(registry.RISK_CLASSES).toContain(capability.risk);
    }
  });

  test('no input or answer schema names an organization or a user', () => {
    for (const capability of catalogue) {
      for (const schema of [capability.input, capability.resumeSchema].filter(Boolean)) {
        expect({ id: capability.id, findings: registry.identityFindings(schema) }).toEqual({
          id: capability.id,
          findings: [],
        });
      }
    }
  });

  test('kcxz.13: no model input names what a card accepts — rows, keys, tokens or snapshots', () => {
    const SELECTION_KEY = /^(selected|selectedids|selectedkeys|selection|selections|factkeys|changeids|token|snapshotkey|decideforperson)$/i;
    const keysOf = (schema, path = []) => {
      const def = schema?._def ?? {};
      if (def.typeName === 'ZodObject') {
        const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
        return Object.entries(shape).flatMap(([key, child]) => [[...path, key], ...keysOf(child, [...path, key])]);
      }
      if (['ZodOptional', 'ZodNullable', 'ZodDefault'].includes(def.typeName)) return keysOf(def.innerType, path);
      if (def.typeName === 'ZodArray') return keysOf(def.type, [...path, '[]']);
      return [];
    };
    for (const capability of catalogue) {
      const found = keysOf(capability.input).filter((path) => SELECTION_KEY.test(path.at(-1)));
      expect({ id: capability.id, found }).toEqual({ id: capability.id, found: [] });
    }
    // The accepting capabilities take their choice only from the person's answer.
    for (const id of ['piece.research', 'piece.check_facts', 'piece.rewrite']) {
      const capability = catalogue.find((entry) => entry.id === id);
      expect({ id, risk: capability.risk, asks: !!capability.resumeSchema }).toEqual({ id, risk: 'paid', asks: true });
    }
  });

  test('the identity rule refuses a declaration that takes an organization or a user, at any depth', () => {
    const base = { id: 'x.y', risk: 'write' };
    expect(() =>
      registry.assertCapabilityInput({
        ...base,
        input: z.object({ organizationId: z.string() }),
      })
    ).toThrow(/identity/);
    expect(() =>
      registry.assertCapabilityInput({
        ...base,
        input: z.object({ target: z.object({ userId: z.string().optional() }) }),
      })
    ).toThrow(/identity/);
  });

  test('USER is offered no write-, paid-, confirm- or input-class tool (activeTools)', () => {
    const offered = new Set(registry.activeCapabilityToolNames(catalogue, 'USER'));
    const leaking = catalogue.filter(
      (capability) =>
        capability.risk !== 'read' && offered.has(registry.toolNameOf(capability.id))
    );
    expect(leaking.map((capability) => capability.id)).toEqual([]);
    // …and the reads still reach every member, but the AI settings: their
    // doors are the administrator's (kcxz.20).
    for (const capability of byClass('read').filter((entry) => entry.group !== 'ai-settings')) {
      expect(offered.has(registry.toolNameOf(capability.id))).toBe(true);
    }
  });

  /**
   * The life of a channel — connecting it, its posting times, its bot,
   * switching it off, deleting it — is an administrator's on the screens
   * (`integrations.controller.ts`, 03.09 audit), so from the chat too
   * (`kcxz.19`). Everything else of the catalogue is an editor's.
   */
  /**
   * The AI settings are the administrator's too (`/settings/ai`, kcxz.20):
   * an editor is not offered even their reads.
   */
  const ADMIN_ONLY = [
    'channel.times',
    'channel.connect',
    'channel.bot.rename',
    'channel.disable',
    'channel.delete',
    'ai.settings',
    'ai.usage',
    'ai.mode',
    'ai.key.enter',
    'ai.key.clear',
    'ai.search_key.clear',
  ];

  test('EDITOR is offered every capability but the channel’s life and the AI settings, which are ADMIN’s', () => {
    expect(registry.activeCapabilityToolNames(catalogue, 'EDITOR')).toEqual(
      catalogue
        .filter((capability) => !ADMIN_ONLY.includes(capability.id))
        .map((capability) => registry.toolNameOf(capability.id))
    );
    expect(registry.activeCapabilityToolNames(catalogue, 'ADMIN')).toEqual(
      catalogue.map((capability) => registry.toolNameOf(capability.id))
    );
  });
});

describe('A1: nothing without a card sends a post out', () => {
  test('no schema outside the confirm class accepts autopilot, queue, publish or schedule values', () => {
    for (const capability of catalogue.filter((entry) => entry.risk !== 'confirm')) {
      for (const schema of [capability.input, capability.resumeSchema].filter(Boolean)) {
        expect({ id: capability.id, findings: registry.outboundFindings(schema) }).toEqual({
          id: capability.id,
          findings: [],
        });
      }
    }
  });

  test.each([
    ['an enum with autopilot', z.object({ planMode: z.enum(['draft', 'reserve', 'autopilot']) })],
    ['a literal publish', z.object({ placement: z.literal('publish') })],
    ['a default of queue', z.object({ where: z.enum(['reserve', 'queue']).default('queue') })],
    ['a free-text status', z.object({ status: z.string() })],
    ['a publishNow flag', z.object({ publishNow: z.boolean().optional() })],
    ['a nested schedule value', z.object({ posts: z.array(z.object({ state: z.enum(['scheduled']) })) })],
  ])('the rule refuses %s in a write-class input', (_name, input) => {
    expect(() =>
      registry.assertCapabilityInput({ id: 'plan.place', risk: 'write', input })
    ).toThrow(/without a card/);
  });

  test('the same values are allowed where the person approves them', () => {
    expect(() =>
      registry.assertCapabilityInput({
        id: 'channel.autopilot',
        risk: 'confirm',
        input: z.object({ planMode: z.enum(['reserve', 'autopilot']) }),
      })
    ).not.toThrow();
  });

  test('an explicit reserve passes', () => {
    expect(() =>
      registry.assertCapabilityInput({
        id: 'plan.place',
        risk: 'write',
        input: z.object({ placement: z.literal('reserve') }),
      })
    ).not.toThrow();
  });
});

describe('F1, F16: an approval card says what and where, for exactly the call (review W1)', () => {
  const all = fixtures();
  const base = catalogue.find((capability) => capability.id === 'piece.delete');

  test('every confirm capability describes its card from the workspace, in both languages', async () => {
    for (const capability of byClass('confirm')) {
      const fixture = all[capability.id];
      for (const language of ['ru', 'en']) {
        const line = await registry.describeApprovalCall(
          catalogue,
          servicesFrom(fixture.services),
          { ...IDENTITY, language },
          registry.toolNameOf(capability.id),
          fixture.input
        );
        expect(typeof line).toBe('string');
        expect(line).not.toBe(capability.label[language]);
        expect(line.length).toBeLessThanOrEqual(registry.AGENT_APPROVAL_SUMMARY_MAX);
      }
    }
  });

  test('piece.delete names the piece by code and title, read in the caller’s workspace', async () => {
    const services = servicesFrom(all['piece.delete'].services);
    const describe = (identity, args) =>
      registry.describeApprovalCall(catalogue, services, identity, 'piece_delete', args);
    expect(await describe(IDENTITY, { pieceId: 'p1' })).toBe(
      'Удалить заготовку cnt-01 «Про созвоны» вместе с её адаптациями'
    );
    expect(await describe({ ...IDENTITY, language: 'en' }, { pieceId: 'p1' })).toBe(
      'Delete piece cnt-01 “Про созвоны” with its adaptations'
    );
    // Another workspace's piece is not found from this one.
    expect(await describe({ ...IDENTITY, organizationId: 'org-2' }, { pieceId: 'p1' })).toMatch(
      /^Удалить заготовку p1 — в этом пространстве её нет/
    );
    // Arguments the schema refuses, a failing read and a non-confirm tool.
    expect(await describe(IDENTITY, { pieceId: '' })).toBe(base.label.ru);
    const failing = servicesFrom({ PieceService: { approvalSubject: async () => { throw new Error('db'); } } });
    expect(
      await registry.describeApprovalCall(catalogue, failing, IDENTITY, 'piece_delete', { pieceId: 'p1' })
    ).toBe(base.label.ru);
    expect(
      await registry.describeApprovalCall(catalogue, services, IDENTITY, 'piece_rename', { pieceId: 'p1', title: 'x' })
    ).toBeNull();
  });

  test('adaptation.delete names the piece and the channel from the stored rows (kcxz.14)', async () => {
    const services = servicesFrom(all['adaptation.delete'].services);
    const describe = (identity, args) =>
      registry.describeApprovalCall(catalogue, services, identity, 'adaptation_delete', args);
    expect(await describe(IDENTITY, { pieceId: 'p1', adaptationId: 'a1' })).toBe(
      'Удалить адаптацию заготовки cnt-01 для канала «Канал про работу» вместе с её черновиком'
    );
    expect(await describe(IDENTITY, { pieceId: 'p1', adaptationId: 'a9' })).toMatch(
      /^Удалить адаптацию a9 — в этом пространстве её нет/
    );
    expect(await describe({ ...IDENTITY, organizationId: 'org-2' }, { pieceId: 'p1', adaptationId: 'a1' })).toMatch(
      /в этом пространстве её нет/
    );
  });

  test('the line is one line, capped', () => {
    expect(registry.cleanApprovalSummary('Удалить\n\u2028 «x»\t ')).toBe('Удалить «x»');
    const long = registry.cleanApprovalSummary('я'.repeat(500));
    expect(long).toHaveLength(registry.AGENT_APPROVAL_SUMMARY_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(registry.cleanApprovalSummary('  ')).toBeNull();
  });

  test('the registry refuses a confirm capability without a card description, and a description elsewhere', () => {
    const { describeApproval, ...bare } = base;
    expect(() => registry.assertCapabilityRegistry([bare])).toThrow(/describes its approval card/);
    const rename = catalogue.find((capability) => capability.id === 'piece.rename');
    expect(() =>
      registry.assertCapabilityRegistry([{ ...rename, describeApproval: async () => 'x' }])
    ).toThrow(/describes its approval card/);
  });

  test.each([
    ['a trimmed string', z.object({ pieceId: z.string().trim() })],
    ['a default', z.object({ pieceId: z.string(), force: z.boolean().default(false) })],
    ['a transform', z.object({ pieceId: z.string().transform((value) => value.toLowerCase()) })],
    ['a preprocess', z.object({ pieceId: z.preprocess((value) => String(value), z.string()) })],
    ['a lower-cased string', z.object({ pieceId: z.string().toLowerCase() })],
  ])('F16: a confirm input with %s is refused — the fingerprint must see what the model sent', (_name, input) => {
    expect(() => registry.assertCapabilityInput({ id: 'x.delete', risk: 'confirm', input })).toThrow(
      /rewrites an approved input/
    );
    // The same schema is fine where no approval is fingerprinted.
    expect(() => registry.assertCapabilityInput({ id: 'x.rename', risk: 'write', input })).not.toThrow();
  });

  test('F16: a refinement changes nothing and passes', () => {
    expect(() =>
      registry.assertCapabilityInput({
        id: 'x.delete',
        risk: 'confirm',
        input: z.object({ pieceId: z.string().min(1).refine((value) => value !== 'x') }),
      })
    ).not.toThrow();
  });
});

describe('A4: foreign words reach the model only as data', () => {
  const all = fixtures();

  test('every capability comes with a working fixture', () => {
    expect(catalogue.map((capability) => capability.id).filter((id) => !all[id])).toEqual([]);
  });

  /** Every place the injected words appear in what the model reads. */
  const exposures = (value, wrapped = false, path = '$') => {
    if (registry.isUntrustedData(value)) {
      return exposures(value.untrustedData.value, true, `${path}.untrustedData`);
    }
    if (typeof value === 'string') {
      return value.includes(INJECTION) ? [{ path, wrapped }] : [];
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, child]) =>
        exposures(child, wrapped, `${path}.${key}`)
      );
    }
    return [];
  };

  test.each(catalogue.map((capability) => [capability.id, capability]))(
    '%s: no unwrapped foreign text in the model output',
    async (id, capability) => {
      const fixture = all[id];
      const tool = registry.buildCapabilityTool(capability, {
        services: servicesFrom(fixture.services),
        language: 'ru',
        entrance: 'chat',
      });
      const { model, asked } = await executeFixture(tool, fixture, {
        requestContext: requestContextFor(registry),
      });
      expect(model?.value?.ok).toBe(true);
      // A card is for the person: nothing it carries is in the model's output.
      if (asked) expect(asked.output).toBeUndefined();
      expect(exposures(model.value).filter((exposure) => !exposure.wrapped)).toEqual([]);
    }
  );

  test('the check catches a capability that forgets to declare its source', async () => {
    const forgetful = { ...registry.channelsList, untrusted: [] };
    const fixture = all['channels.list'];
    const tool = registry.buildCapabilityTool(forgetful, {
      services: servicesFrom(fixture.services),
      language: 'ru',
      entrance: 'chat',
    });
    const { model } = await executeTool(tool, fixture.input, {
      requestContext: requestContextFor(registry),
    });
    expect(exposures(model.value).filter((exposure) => !exposure.wrapped)).not.toEqual([]);
  });

  test('a capability that declares an untrusted source always wraps its whole summary', async () => {
    for (const capability of catalogue.filter((entry) => entry.untrusted.length)) {
      const fixture = all[capability.id];
      const tool = registry.buildCapabilityTool(capability, {
        services: servicesFrom(fixture.services),
        language: 'ru',
        entrance: 'chat',
      });
      const { model } = await executeFixture(tool, fixture, {
        requestContext: requestContextFor(registry),
      });
      expect(registry.isUntrustedData(model.value.summary)).toBe(true);
    }
  });
});

describe('U1: every paid capability goes through the paid adapter', () => {
  test('a paid capability run inside a turn sees no admitted configuration, in the call and in every generator pull', async () => {
    const aiConfig = providerConfig();
    const local = loadRegistry({ aiConfig });
    const all = fixtures();
    const turnConfig = { usageMode: 'included', provider: 'openai', apiKey: 'k' };
    const paid = local.CAPABILITY_CATALOGUE.filter((capability) => capability.risk === 'paid');
    expect(paid.length).toBeGreaterThan(0);

    for (const capability of paid) {
      const seen = [];
      const observe = (where) =>
        seen.push([where, aiConfig.getActiveAiConfig(IDENTITY.organizationId) ?? null]);
      // Wrap every function of the fixture's services with the observation.
      const services = Object.fromEntries(
        Object.entries(all[capability.id].services).map(([name, service]) => [
          name,
          Object.fromEntries(
            Object.entries(service).map(([method, fn]) => [
              method,
              fn.constructor.name === 'AsyncGeneratorFunction'
                ? async function* (...args) {
                    observe(`${method}:start`);
                    for await (const item of fn(...args)) {
                      observe(`${method}:pull`);
                      yield item;
                    }
                  }
                : async (...args) => {
                    observe(method);
                    return fn(...args);
                  },
            ])
          ),
        ])
      );
      const tool = local.buildCapabilityTool(capability, {
        services: servicesFrom(services),
        language: 'ru',
        entrance: 'chat',
      });
      const { output } = await aiConfig.withActiveAiConfig(
        IDENTITY.organizationId,
        turnConfig,
        () =>
          executeFixture(tool, all[capability.id], {
            requestContext: requestContextFor(local),
          }),
        'agent'
      );
      expect(output.ok).toBe(true);
      // Every service call — and every generator pull — ran outside the turn.
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.filter(([, config]) => config !== null)).toEqual([]);
    }
  });

  test('the helper the adapter uses leaves only the admitted configuration', () => {
    const aiConfig = providerConfig();
    const config = { usageMode: 'included' };
    aiConfig.withActiveAiConfig('org-1', config, () => {
      expect(aiConfig.getActiveAiConfig('org-1')).toBe(config);
      aiConfig.withoutActiveAiConfig(() => {
        expect(aiConfig.getActiveAiConfig('org-1')).toBeUndefined();
      });
      expect(aiConfig.getActiveAiConfig('org-1')).toBe(config);
    });
  });
});
