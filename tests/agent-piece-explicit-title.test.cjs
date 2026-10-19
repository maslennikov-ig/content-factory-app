'use strict';

const {
  loadRegistry,
  requestContextFor,
  servicesFrom,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((capability) => capability.id === id);
const title = 'Финальный прогон 17 октября: три вопроса перед встречей';
const build = (id, services) =>
  registry.buildCapabilityTool(find(id), {
    services: servicesFrom(services),
    language: 'ru',
    entrance: 'chat',
  });
const hookCall = (id, input, requestContext) => ({
  toolName: registry.toolNameOf(id),
  input,
  context: { requestContext, toolCallId: `call-${id}` },
});

describe('a new piece with an explicit title', () => {
  test('the native planner preserves the original request, verifies saved content and never repeats a paid create', () => {
    const create = find('piece.create');
    expect(create.description).toMatch(/original words verbatim/i);
    expect(create.description).toMatch(/existing brief model interprets/i);
    expect(create.description).toMatch(/verify the saved title and content/i);
    expect(create.description).toMatch(/do not repeat paid create/i);
    expect(create.input.safeParse({ text: 'Создай материал', inputKind: 'instruction', research: 'none' }).success).toBe(true);
    expect(find('piece.rename')).toBeDefined();
  });

  test('create preserves the model-understood title, verified through native reads, while questions remain for the person', async () => {
    const stored = new Map();
    const prepare = jest.fn(async (_organizationId, body) => ({ body }));
    const run = jest.fn(async function* () {
      stored.set('p9', {
        id: 'p9',
        code: 'cnt-9',
        title,
      });
      yield { name: 'intake-started' };
      yield { name: 'piece', pieceId: 'p9', code: 'cnt-9' };
      yield { name: 'questions', questions: [{}, {}, {}] };
      yield { name: 'done', pieceId: 'p9' };
    });
    const updateTitle = jest.fn(async (organizationId, pieceId, nextTitle) => {
      expect(organizationId).toBe('org-1');
      const piece = stored.get(pieceId);
      if (!piece) throw new Error('not found');
      piece.title = nextTitle;
      return { title: nextTitle };
    });
    const prepareAnswer = jest.fn();
    const services = {
      IntakeService: { prepare, run },
      PieceService: { updateTitle, prepareAnswer, detail: async (organizationId, pieceId) => {
        expect(organizationId).toBe('org-1');
        return { piece: stored.get(pieceId), core: { text: 'Три вопроса перед встречей.' } };
      } },
    };
    const requestContext = requestContextFor(registry);
    const hooks = registry.createCapabilityHooks(registry.CAPABILITY_CATALOGUE, {
      check: async () => ({ allowed: true, policies: [] }),
    });

    const createInput = {
      text: `Создай новую заготовку с названием «${title}» и напиши материал о трёх вопросах перед встречей`,
      inputKind: 'instruction',
    };
    const createCall = hookCall('piece.create', createInput, requestContext);
    await expect(hooks.beforeToolCall(createCall)).resolves.toBeUndefined();
    const created = await executeTool(build('piece.create', services), createInput, { requestContext });
    await hooks.afterToolCall({ ...createCall, output: created.output });

    expect(created.output.summary).toEqual({
      pieceId: 'p9',
      code: 'cnt-9',
      questions: 3,
    });
    expect(created.output.summary).not.toHaveProperty('title');
    const read = await executeTool(build('piece.read', services), { pieceId: 'p9' }, { requestContext });
    expect(read.output.summary.untrustedData.value).toMatchObject({ pieceId: 'p9', title, text: 'Три вопроса перед встречей.' });
    expect(updateTitle).not.toHaveBeenCalled();

    const answerCall = hookCall(
      'piece.answer',
      { pieceId: 'p9', answers: null, decide: ['audience'] },
      requestContext
    );
    const refusedAnswer = await hooks.beforeToolCall(answerCall);
    expect(refusedAnswer.output).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });

    expect(stored.get('p9')).toMatchObject({ id: 'p9', code: 'cnt-9', title });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ input: createInput.text, options: { researchEnabled: false, researchLevel: 'standard' } }),
      { researchSelectionPolicy: 'model' }
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(updateTitle).not.toHaveBeenCalled();
    expect(prepareAnswer).not.toHaveBeenCalled();
  });
});
