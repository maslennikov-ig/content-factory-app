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
  test('the native planner contract creates once, renames once, and reports only confirmed titles', () => {
    const create = find('piece.create');

    expect(create.description).toMatch(/explicitly gives the new piece a title/i);
    expect(create.description).toMatch(/call `piece\.create` once, then immediately call `piece\.rename` once/i);
    expect(create.description).toMatch(/returned id and that exact title/i);
    expect(create.description).toMatch(/do not ask for another command/i);
    expect(create.description).toMatch(/claim the requested title only when `piece\.rename` returns it/i);
    expect(create.description).toMatch(/created but the title was not confirmed/i);
    expect(create.description).toMatch(/never repeat the paid create/i);
  });

  test('create then rename preserves one piece while its three questions remain for the person', async () => {
    const stored = new Map();
    const prepare = jest.fn(async (_organizationId, body) => ({ body }));
    const run = jest.fn(async function* () {
      stored.set('p9', {
        id: 'p9',
        code: 'cnt-9',
        title: 'Перед созвоном сначала стоит проверить, нужна ли команде встреча.',
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
      PieceService: { updateTitle, prepareAnswer },
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
      research: 'standard',
    });
    expect(created.output.summary).not.toHaveProperty('title');
    expect(stored.get('p9').title).toBe('Перед созвоном сначала стоит проверить, нужна ли команде встреча.');

    const answerCall = hookCall(
      'piece.answer',
      { pieceId: 'p9', answers: null, decide: ['audience'] },
      requestContext
    );
    const refusedAnswer = await hooks.beforeToolCall(answerCall);
    expect(refusedAnswer.output).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });

    const renameInput = { pieceId: created.output.summary.pieceId, title };
    const renameCall = hookCall('piece.rename', renameInput, requestContext);
    await expect(hooks.beforeToolCall(renameCall)).resolves.toBeUndefined();
    const renamed = await executeTool(build('piece.rename', services), renameInput, { requestContext });
    await hooks.afterToolCall({ ...renameCall, output: renamed.output });

    expect(renamed.output.summary).toEqual({ pieceId: 'p9', title });
    expect(stored.get('p9')).toMatchObject({ id: 'p9', code: 'cnt-9', title });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ input: createInput.text })
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(updateTitle).toHaveBeenCalledTimes(1);
    expect(updateTitle).toHaveBeenCalledWith('org-1', 'p9', title);
    expect(prepareAnswer).not.toHaveBeenCalled();
  });
});
