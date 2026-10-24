'use strict';

/**
 * The agent-level `beforeToolCall` / `afterToolCall` of the capability
 * registry (`content-factory-next-kcxz.6`, ADR-0012 amendment §4): the CASL
 * re-check, the paid cap, and an approval bound to `toolName + args`.
 *
 * The last block runs them inside a real Mastra `Agent` with a scripted model,
 * so the wiring — not only the functions — is what is proven.
 */

const {
  IDENTITY,
  fixtures,
  loadRegistry,
  permissionsService,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const tool = (id) => registry.toolNameOf(id);

const allowAll = () => ({
  calls: [],
  async check(door, identity) {
    this.calls.push([door.controller.name, door.method, identity.role]);
    return { allowed: true, policies: [] };
  },
});

/** The real `DoorPolicyGate` over the real `PermissionsService`, no billing. */
const realGate = () => new registry.DoorPolicyGate(permissionsService());

const hookCall = (id, input, requestContext) => ({
  toolName: tool(id),
  input,
  context: { requestContext, toolCallId: `call-${Math.random()}` },
});

describe('beforeToolCall', () => {
  test('a role the door refuses gets a declined call with the reason, and nothing runs', async () => {
    const hooks = registry.createCapabilityHooks(catalogue, realGate());
    const context = requestContextFor(registry, { ...IDENTITY, role: 'USER' });
    const result = await hooks.beforeToolCall(
      hookCall('piece.rename', { pieceId: 'p1', title: 'x' }, context)
    );
    expect(result).toEqual({
      proceed: false,
      output: expect.objectContaining({
        ok: false,
        code: 'PERMISSION_DENIED',
        reason: expect.stringContaining('create:editor'),
      }),
    });
  });

  test('the same door lets an editor through', async () => {
    const hooks = registry.createCapabilityHooks(catalogue, realGate());
    const context = requestContextFor(registry);
    await expect(
      hooks.beforeToolCall(hookCall('piece.rename', { pieceId: 'p1', title: 'x' }, context))
    ).resolves.toBeUndefined();
  });

  test('a read door without policies lets every member through', async () => {
    const hooks = registry.createCapabilityHooks(catalogue, realGate());
    const context = requestContextFor(registry, { ...IDENTITY, role: 'USER' });
    await expect(
      hooks.beforeToolCall(hookCall('channels.list', {}, context))
    ).resolves.toBeUndefined();
  });

  test('a call without a server-built identity is declined before any check', async () => {
    const gate = allowAll();
    const hooks = registry.createCapabilityHooks(catalogue, gate);
    const { RequestContext } = require('@mastra/core/request-context');
    const result = await hooks.beforeToolCall(
      hookCall('channels.list', {}, new RequestContext())
    );
    expect(result.output.code).toBe('IDENTITY_MISSING');
    expect(gate.calls).toEqual([]);
  });

  test('a tool that is not a capability passes untouched', async () => {
    const hooks = registry.createCapabilityHooks(catalogue, allowAll());
    await expect(
      hooks.beforeToolCall({ toolName: 'skill_read', input: {}, context: {} })
    ).resolves.toBeUndefined();
  });

  describe('a new piece’s questions are the person’s (kcxz.31 D1)', () => {
    const created = (pieceId, questions) => ({
      ...hookCall('piece.create', { text: 'мысль' }, null),
      output: { ok: true, capability: 'piece.create', summary: { pieceId, code: 'cnt-9', questions } },
    });
    const answer = (context, pieceId = 'p9') =>
      hookCall('piece.answer', { pieceId, answers: null, decide: ['audience'] }, context);

    test('native question tools may open the exact saved questions in the same request without applying model answers', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      await hooks.afterToolCall({ ...created('p9', 2), context: { requestContext: context } });
      const call = answer(context);
      await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
      const capability = catalogue.find(entry => entry.id === 'piece.answer');
      expect(capability.nativeDomainQuestions).toBe(true);
      const prepareAnswer = jest.fn();
      const nativeTool = registry.buildCapabilityTool(capability, {
        language: 'ru', entrance: 'chat', services: servicesFrom({PieceService: {
          prepareAnswer,
          detail: async () => ({piece: {id: 'p9', code: 'cnt-9'}, core: {text: 'Сохранённая суть',
            questions: {round: 1, answered: [], items: [{field: 'audience', question: 'Для кого пишем?', suggested: null}]}}}),
        }}),
      });
      const opened = await executeTool(nativeTool, call.input, {requestContext: context});
      expect(opened.output).toBeUndefined();
      expect(opened.suspended[0]).toMatchObject({kind: 'domain-questions', activeKey: 'audience', answers: []});
      expect(prepareAnswer).not.toHaveBeenCalled();
      await hooks.afterToolCall({...call, output: opened.output});
      await expect(hooks.beforeToolCall(answer(context, 'p1'))).resolves.toBeUndefined();
      await expect(hooks.beforeToolCall(answer(requestContextFor(registry)))).resolves.toBeUndefined();
    });

    test('the same-request protection remains for a tool which can still apply model-provided manual answers', async () => {
      const legacy = catalogue.map(capability => capability.id === 'piece.answer'
        ? {...capability, nativeDomainQuestions: undefined} : capability);
      const hooks = registry.createCapabilityHooks(legacy, allowAll());
      const context = requestContextFor(registry);
      await hooks.afterToolCall({...created('p9', 2), context: {requestContext: context}});
      const refused = await hooks.beforeToolCall(answer(context));
      expect(refused.output).toMatchObject({ok: false, code: 'INPUT_NEEDS_PERSON'});
      expect(context.get('cf.paidCalls') ?? 0).toBe(0);
    });

    test('a piece written with no open questions, or a refused write, opens nothing', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      await hooks.afterToolCall({ ...created('p9', 0), context: { requestContext: context } });
      await hooks.afterToolCall({
        ...created('p8', 2),
        output: { ok: false, code: 'INTAKE_FAILED', reason: 'x' },
        context: { requestContext: context },
      });
      await expect(hooks.beforeToolCall(answer(context))).resolves.toBeUndefined();
    });
  });

  describe('one open card of proposed changes per text (kcxz.32 N2)', () => {
    const rewrite = (context, extra = {}) => ({
      ...hookCall('adaptation.rewrite', { pieceId: 'p1', adaptationId: 'a1', instruction: 'проще' }, context),
      ...extra,
    });

    test('each check and rewrite names the text it proposes changes to', () => {
      const byId = new Map(catalogue.map((capability) => [capability.id, capability]));
      expect(byId.get('piece.rewrite').proposes({ pieceId: 'p1', instruction: 'x' })).toBe('core:p1');
      expect(byId.get('piece.check_facts').proposes({ pieceId: 'p1' })).toBe('core:p1');
      expect(byId.get('adaptation.rewrite').proposes({ pieceId: 'p1', adaptationId: 'a1', instruction: 'x' })).toBe('adaptation:a1');
      expect(byId.get('adaptation.review').proposes({ pieceId: 'p1', adaptationId: 'a1', check: 'facts' })).toBe('adaptation:a1');
      // Only what pauses on a changes card proposes.
      expect(
        catalogue.filter((capability) => capability.proposes).map((capability) => capability.id).sort()
      ).toEqual(['adaptation.review', 'adaptation.rewrite', 'piece.check_facts', 'piece.rewrite']);
    });

    test('refused while a card for the same text waits — before a paid slot, with where to look', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      registry.setOpenProposals(context, ['adaptation:a1']);
      const refused = await hooks.beforeToolCall(rewrite(context));
      expect(refused).toEqual({
        proceed: false,
        output: expect.objectContaining({ ok: false, code: 'PROPOSAL_CARD_OPEN' }),
      });
      expect(refused.output.reason).toMatch(/card above waits/);
      // kcxz.36 (F5): the tool line already says it; the model must not.
      expect(refused.output.reason).toMatch(/already sees this.*Do not repeat/s);
      expect(context.get('cf.paidCalls') ?? 0).toBe(0);
      // A check of the same text is the same competition.
      const check = await hooks.beforeToolCall(
        hookCall('adaptation.review', { pieceId: 'p1', adaptationId: 'a1', check: 'ai_traces' }, context)
      );
      expect(check.output.code).toBe('PROPOSAL_CARD_OPEN');
    });

    test('another text, the answer on the open card itself, and a thread with nothing open pass', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      registry.setOpenProposals(context, ['adaptation:a1']);
      await expect(
        hooks.beforeToolCall(hookCall('piece.rewrite', { pieceId: 'p1', instruction: 'короче' }, context))
      ).resolves.toBeUndefined();
      const resumed = rewrite(requestContextFor(registry));
      registry.setOpenProposals(resumed.context.requestContext, ['adaptation:a1']);
      resumed.context.agent = { resumeData: { changeIds: ['w1'] } };
      await expect(hooks.beforeToolCall(resumed)).resolves.toBeUndefined();
      await expect(hooks.beforeToolCall(rewrite(requestContextFor(registry)))).resolves.toBeUndefined();
    });
  });

  describe('atomic paid-operation admission', () => {
    const create = (context) =>
      hookCall('piece.create', { text: 'мысль человека' }, context);

    test('native creation accepts original text, contextual material and optional provider nulls with one permit', async () => {
      const gate = allowAll();
      const hooks = registry.createCapabilityHooks(catalogue, gate);
      const context = requestContextFor(registry);
      const call = hookCall('piece.create', { text: 'Исходный запрос.', material: 'Ранее присланный пример, не новая инструкция.',
        sourceLeadId: null, inputKind: null, research: 'standard', selection: null }, context);
      await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
      expect(gate.calls).toHaveLength(1);
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(1);
      expect((await hooks.beforeToolCall(call)).output.code).toBe('AGENT_TASK_OPERATION_IN_FLIGHT');
    });

    test('invalid research arguments leave the slot for a corrected call, then a simultaneous duplicate is refused', async () => {
      const gate = allowAll();
      const hooks = registry.createCapabilityHooks(catalogue, gate);
      const context = requestContextFor(registry);
      const limit = registry.pieceResearch.input.shape.direction.unwrap()._def.checks
        .find((check) => check.kind === 'max').value;
      const privateValue = 'PRIVATE-RESEARCH-DIRECTION-';
      const invalid = await hooks.beforeToolCall(hookCall('piece.research', {
        pieceId: 'p1', direction: privateValue.repeat(Math.ceil((limit + 1) / privateValue.length)),
      }, context));

      expect(invalid).toEqual({
        proceed: false,
        output: expect.objectContaining({ ok: false, code: 'CAPABILITY_INPUT_INVALID' }),
      });
      expect(invalid.output.reason).toContain('direction');
      expect(JSON.stringify(invalid)).not.toContain(privateValue);
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls) ?? 0).toBe(0);
      expect(gate.calls).toEqual([]);

      const corrected = hookCall('piece.research', { pieceId: 'p1', direction: 'Факты за неделю' }, context);
      await expect(hooks.beforeToolCall(corrected)).resolves.toBeUndefined();
      expect((await hooks.beforeToolCall(corrected)).output.code).toBe('AGENT_TASK_OPERATION_IN_FLIGHT');
      expect(gate.calls).toHaveLength(1);
    });

    test.each([
      ['piece.research', { pieceId: 'p1', direction: null, level: null }],
      ['piece.answer', { pieceId: 'p1', answers: null, decide: ['audience'] }],
    ])('%s accepts optional null fields like native Mastra and still reserves one in-flight permit', async (id, input) => {
      const gate = allowAll();
      const hooks = registry.createCapabilityHooks(catalogue, gate);
      const context = requestContextFor(registry);
      const call = hookCall(id, input, context);

      await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(1);
      expect((await hooks.beforeToolCall(call)).output.code).toBe('AGENT_TASK_OPERATION_IN_FLIGHT');
      expect(gate.calls).toHaveLength(1);
    });

    test('required null fields stay invalid and leave the slot for a corrected call with optional nulls', async () => {
      const gate = allowAll();
      const hooks = registry.createCapabilityHooks(catalogue, gate);
      const context = requestContextFor(registry);
      const refused = await hooks.beforeToolCall(hookCall('piece.research', {
        pieceId: null, direction: null, level: null,
      }, context));

      expect(refused.output).toMatchObject({ ok: false, code: 'CAPABILITY_INPUT_INVALID' });
      expect(refused.output.reason).toContain('pieceId');
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls) ?? 0).toBe(0);
      expect(gate.calls).toEqual([]);
      await expect(hooks.beforeToolCall(hookCall('piece.research', {
        pieceId: 'p1', direction: null, level: null,
      }, context))).resolves.toBeUndefined();
    });

    test('invalid input is refused before declaration callbacks and never consumes a paid slot', async () => {
      const answers = jest.fn(() => { throw new Error('must not read invalid input'); });
      const proposes = jest.fn(() => { throw new Error('must not read invalid input'); });
      const capability = { ...registry.pieceResearch, personQuestions: { answers }, proposes };
      const hooks = registry.createCapabilityHooks([capability], allowAll());
      const context = requestContextFor(registry);

      const result = await hooks.beforeToolCall(hookCall('piece.research', null, context));
      expect(result.output.code).toBe('CAPABILITY_INPUT_INVALID');
      expect(answers).not.toHaveBeenCalled();
      expect(proposes).not.toHaveBeenCalled();
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls) ?? 0).toBe(0);
    });

    test('validation paths cannot echo caller-controlled record keys or rejected values', async () => {
      const { z } = require('zod');
      const capability = {
        ...registry.pieceResearch,
        input: z.object({ entries: z.record(z.enum(['allowed'])) }).strict(),
      };
      const hooks = registry.createCapabilityHooks([capability], allowAll());
      const result = await hooks.beforeToolCall(hookCall('piece.research', {
        entries: { 'PRIVATE-RECORD-KEY': 'PRIVATE-INVALID-VALUE' },
        'PRIVATE-UNKNOWN-FIELD': 'PRIVATE-UNKNOWN-VALUE',
      }, requestContextFor(registry)));

      expect(result.output.code).toBe('CAPABILITY_INPUT_INVALID');
      expect(result.output.reason).toContain('entries');
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
    });

    test('settled operations release the permit for all further requested steps', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      for (let index = 0; index < 5; index += 1) {
        const call = create(context);
        await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
        await hooks.afterToolCall({ ...call, output: { ok: true } });
      }
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(5);
    });

    test('three parallel paid calls in one step: exactly one proceeds', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      const results = await Promise.all([
        hooks.beforeToolCall(create(context)),
        hooks.beforeToolCall(create(context)),
        hooks.beforeToolCall(create(context)),
      ]);
      expect(results.filter((result) => result === undefined)).toHaveLength(1);
      expect(results.filter((result) => result?.output?.code === 'AGENT_TASK_OPERATION_IN_FLIGHT')).toHaveLength(2);
    });

    test('legacy message/approval limits do not restrict sequential requested operations', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      context.set(registry.CAPABILITY_CONTEXT_KEYS.paidLimit, 1);
      for (let index = 0; index < 4; index += 1) {
        const call = create(context);
        await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
        await hooks.afterToolCall({ ...call, output: { ok: true } });
      }
      expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(4);
    });

    test('a paid call the door refuses gives its slot back', async () => {
      const refuseOnce = {
        refused: false,
        async check() {
          if (this.refused) return { allowed: true, policies: [] };
          this.refused = true;
          return { allowed: false, policies: [], refused: 'create:posts_per_month' };
        },
      };
      const hooks = registry.createCapabilityHooks(catalogue, refuseOnce);
      const context = requestContextFor(registry);
      expect((await hooks.beforeToolCall(create(context))).output.code).toBe('PERMISSION_DENIED');
      await expect(hooks.beforeToolCall(create(context))).resolves.toBeUndefined();
    });

    test('free calls do not count', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      for (let index = 0; index < 5; index += 1) {
        await expect(hooks.beforeToolCall(hookCall('channels.list', {}, context))).resolves.toBeUndefined();
      }
      await expect(hooks.beforeToolCall(create(context))).resolves.toBeUndefined();
    });
  });

  describe('approval fingerprint', () => {
    const args = { pieceId: 'p1' };

    test('a confirm call without the person\'s approval is declined', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const result = await hooks.beforeToolCall(
        hookCall('piece.delete', args, requestContextFor(registry))
      );
      expect(result.output.code).toBe('APPROVAL_MISMATCH');
    });

    test('an approval for other arguments does not run this call', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      registry.grantApproval(
        context,
        registry.approvalFingerprint(tool('piece.delete'), { pieceId: 'p2' })
      );
      const result = await hooks.beforeToolCall(hookCall('piece.delete', args, context));
      expect(result.output.code).toBe('APPROVAL_MISMATCH');
    });

    test('an approval for another tool with the same arguments does not run this call', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      registry.grantApproval(context, registry.approvalFingerprint('piece_archive', args));
      const result = await hooks.beforeToolCall(hookCall('piece.delete', args, context));
      expect(result.output.code).toBe('APPROVAL_MISMATCH');
    });

    test('the approved call runs once; the approval is spent after it', async () => {
      const hooks = registry.createCapabilityHooks(catalogue, allowAll());
      const context = requestContextFor(registry);
      registry.grantApproval(context, registry.approvalFingerprint(tool('piece.delete'), args));
      const call = hookCall('piece.delete', args, context);
      await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
      await hooks.afterToolCall({ ...call, output: { ok: true } });
      const again = await hooks.beforeToolCall(call);
      expect(again.output.code).toBe('APPROVAL_MISMATCH');
    });

    describe('review W2 F4: «Да» to a post is bound to its text', () => {
      const publish = { pieceId: 'p1', adaptationId: 'a1' };
      const post = { text: 'Текст, который видел человек' };
      const services = servicesFrom({
        PieceService: {
          detail: async () => ({
            piece: { code: 'cnt-1' },
            adaptations: [{ id: 'a1', integrationId: 'ch1', state: 'draft', body: post.text, mediaId: null }],
          }),
        },
      });
      const grantShown = async (context) => {
        const shown = await registry.approvalContentDigest(catalogue, services, IDENTITY, tool('plan.publish_now'), publish);
        registry.grantApproval(context, registry.approvalFingerprint(tool('plan.publish_now'), publish));
        registry.grantApproval(context, registry.approvalContentFingerprint(tool('plan.publish_now'), publish, shown));
      };

      test('the text the card showed runs; the approval and its binding are spent after it', async () => {
        post.text = 'Текст, который видел человек';
        const hooks = registry.createCapabilityHooks(catalogue, allowAll(), services);
        const context = requestContextFor(registry);
        await grantShown(context);
        const call = hookCall('plan.publish_now', publish, context);
        await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
        await hooks.afterToolCall({ ...call, output: { ok: true } });
        expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.approvals)).toBe('');
      });

      test('a text edited between the card and the run is refused, nothing runs', async () => {
        post.text = 'Текст, который видел человек';
        const hooks = registry.createCapabilityHooks(catalogue, allowAll(), services);
        const context = requestContextFor(registry);
        await grantShown(context);
        post.text = 'Спам и ссылка, которых человек не видел';
        const result = await hooks.beforeToolCall(hookCall('plan.publish_now', publish, context));
        expect(result.output.code).toBe('APPROVAL_CONTENT_CHANGED');
      });

      test('without the services to read the text, a bound approval is not proven', async () => {
        post.text = 'Текст, который видел человек';
        const hooks = registry.createCapabilityHooks(catalogue, allowAll());
        const context = requestContextFor(registry);
        await grantShown(context);
        const result = await hooks.beforeToolCall(hookCall('plan.publish_now', publish, context));
        expect(result.output.code).toBe('APPROVAL_CONTENT_CHANGED');
      });
    });

    test('the fingerprint does not depend on key order', () => {
      expect(registry.approvalFingerprint('t', { a: 1, b: { c: 2, d: 3 } })).toBe(
        registry.approvalFingerprint('t', { b: { d: 3, c: 2 }, a: 1 })
      );
      expect(registry.approvalFingerprint('t', { a: 1 })).not.toBe(
        registry.approvalFingerprint('t', { a: 2 })
      );
    });
  });
});

describe('the hooks inside a real Mastra agent', () => {
  // `@mastra/core/agent` reaches ESM-only packages that this runner cannot
  // load, and plain Node can. The scenarios run in a child Node process with
  // the same registry loader and report what happened.
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  let report;

  beforeAll(() => {
    report = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(__dirname, 'helpers', 'agent-capabilities.agent-probe.cjs')],
        { encoding: 'utf8', timeout: 60_000 }
      )
    );
  }, 90_000);

  test('three paid calls in one native step run sequentially after each permit settles', () => {
    const { runs, outcomes } = report.paidCap;
    expect(runs).toBe(3);
    expect(outcomes.filter((outcome) => outcome.ok === true)).toHaveLength(3);
    expect(outcomes.some((outcome) => outcome.code === 'AGENT_TASK_OPERATION_IN_FLIGHT')).toBe(false);
  });

  test("a USER's write call is declined by the door's own policies, and the service is never called", () => {
    const { calls, outcomes } = report.roleRefusal;
    expect(outcomes.map((outcome) => outcome.code)).toEqual(['PERMISSION_DENIED']);
    expect(calls).toBe(0);
  });

  test('the model is shown the refusal code and its reason as the tool result', () => {
    expect(report.roleRefusal.modelSaw).toEqual(
      expect.objectContaining({ ok: false, code: 'PERMISSION_DENIED' })
    );
  });

  test('invalid paid research can be corrected in the same native turn without losing its slot', () => {
    const sequence = JSON.parse(execFileSync(process.execPath, ['-e', String.raw`
      const { Agent } = require('@mastra/core/agent');
      const { loadRegistry, requestContextFor, servicesFrom } = require(process.argv[1]);
      const registry = loadRegistry();
      const capability = registry.pieceResearch;
      const context = requestContextFor(registry);
      const limit = capability.input.shape.direction.unwrap()._def.checks
        .find((check) => check.kind === 'max').value;
      const marker = 'PRIVATE-NATIVE-RESEARCH-DIRECTION-';
      const inputs = [
        { pieceId: 'p1', direction: marker.repeat(Math.ceil((limit + 1) / marker.length)) },
        { pieceId: 'p1', direction: 'Факты за неделю', level: null },
        { pieceId: 'p1', direction: 'Ещё факты за неделю', level: 'quick' },
      ];
      const checkpoints = [];
      const modelSaw = new Map();
      const serviceDirections = [];
      let step = 0;
      let gateCalls = 0;
      const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
      const model = {
        specificationVersion: 'v3', provider: 'scripted', modelId: 'scripted', supportedUrls: {},
        doStream: async () => { throw new Error('The scripted model only generates.'); },
        doGenerate: async ({ prompt }) => {
          checkpoints.push({ runs: serviceDirections.length, slots: context.get('cf.paidCalls') ?? 0 });
          for (const message of prompt) {
            if (message.role !== 'tool') continue;
            for (const part of message.content) {
              modelSaw.set(part.toolCallId, part.output?.value ?? part.output);
            }
          }
          const input = inputs[step++];
          return {
            content: input
              ? [{ type: 'tool-call', toolCallId: 'research-' + step, toolName: 'piece_research', input: JSON.stringify(input) }]
              : [{ type: 'text', text: 'Готово.' }],
            finishReason: input ? { unified: 'tool-calls', raw: 'tool_calls' } : { unified: 'stop', raw: 'stop' },
            usage, warnings: [],
          };
        },
      };
      const tools = registry.buildMastraCapabilityTools([capability], {
        services: servicesFrom({ PieceService: {
          researchCore: async (_organizationId, _pieceId, _userId, request) => {
            serviceDirections.push(request.direction);
            return { level: 'quick', facts: [] };
          },
        } }),
        language: 'ru',
      });
      const agent = new Agent({
        id: 'capability-corrected-research', name: 'capability-corrected-research', instructions: 'test',
        model, tools, hooks: registry.createCapabilityHooks([capability], {
          check: async () => { gateCalls += 1; return { allowed: true, policies: [] }; },
        }),
      });
      agent.generate('Дополнить ресерчем', { requestContext: context, maxSteps: 4 })
        .then((result) => process.stdout.write(JSON.stringify({
          outcomes: result.toolResults.map((entry) => (entry.payload ?? entry).result),
          checkpoints, modelSaw: [...modelSaw.values()], serviceDirections, gateCalls,
        })))
        .catch((error) => { process.stderr.write(String(error?.stack || error)); process.exit(1); });
    `, path.join(__dirname, 'helpers', 'agent-capabilities.cjs')], {
      encoding: 'utf8', timeout: 60_000,
    }));

    expect(sequence.outcomes).toEqual([
      expect.objectContaining({ ok: false, code: 'CAPABILITY_INPUT_INVALID' }),
      expect.objectContaining({ ok: true, capability: 'piece.research' }),
      expect.objectContaining({ ok: true, capability: 'piece.research' }),
    ]);
    expect(sequence.modelSaw).toEqual([
      sequence.outcomes[0],
      { ok: true, summary: sequence.outcomes[1].summary },
      { ok: true, summary: sequence.outcomes[2].summary },
    ]);
    expect(sequence.checkpoints).toEqual([
      { runs: 0, slots: 0 }, { runs: 0, slots: 0 },
      { runs: 1, slots: 1 }, { runs: 2, slots: 2 },
    ]);
    expect(sequence.serviceDirections).toEqual(['Факты за неделю', 'Ещё факты за неделю']);
    expect(sequence.gateCalls).toBe(2);
    expect(JSON.stringify(sequence)).not.toContain('PRIVATE-NATIVE');
  }, 90_000);
});

/* ---- kcxz.38 (R5): an open-card refusal alone ends the turn ------------- */

describe('stopAfterOpenProposalRefusal (Mastra stopWhen)', () => {
  const stop = registry.stopAfterOpenProposalRefusal;
  const call = (id) => ({ type: 'tool-call', toolCallId: id, toolName: 'adaptation_review' });
  const result = (id, value, wrapped = true) => ({
    type: 'tool-result',
    toolCallId: id,
    output: wrapped ? { type: 'json', value } : value,
  });
  const OPEN = { ok: false, code: 'PROPOSAL_CARD_OPEN', reason: '…' };

  test('a step whose every call met an open card stops, wrapped or bare', () => {
    expect(stop({ steps: [{ content: [call('c1'), result('c1', OPEN)] }] })).toBe(true);
    expect(stop({ steps: [{ content: [call('c1'), result('c1', OPEN, false), call('c2'), result('c2', OPEN)] }] })).toBe(true);
  });

  test('another tool in the step, another refusal, a pending result or no tools: the turn goes on', () => {
    expect(stop({ steps: [{ content: [call('c1'), result('c1', OPEN), call('c2'), result('c2', { ok: true })] }] })).toBe(false);
    expect(stop({ steps: [{ content: [call('c1'), result('c1', { ok: false, code: 'AGENT_TASK_OPERATION_IN_FLIGHT' })] }] })).toBe(false);
    expect(stop({ steps: [{ content: [call('c1'), result('c1', OPEN), call('c2')] }] })).toBe(false);
    expect(stop({ steps: [{ content: [{ type: 'text', text: 'Готово.' }] }] })).toBe(false);
    expect(stop({ steps: [] })).toBe(false);
  });

  test('only the last step counts', () => {
    expect(
      stop({ steps: [{ content: [call('c1'), result('c1', OPEN)] }, { content: [call('c2'), result('c2', { ok: true })] }] })
    ).toBe(false);
  });
});
