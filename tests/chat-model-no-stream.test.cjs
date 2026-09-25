/**
 * The post draft runs inside LangGraph `streamEvents`, and there LangChain
 * turns a chat model's `invoke` into a stream by itself. A stream skips the
 * transport's retry after a cut answer, so the sixteenth walk (25.09.2026)
 * still got `Failed to parse … Unterminated string` on B1 after 97dq.91.
 *
 * Real `@langchain/core` and `@langchain/openai`, a mocked `fetch`: no request
 * leaves the process.
 */
const { ChatOpenAI } = require('@langchain/openai');
const { StateGraph, Annotation, START, END } = require('@langchain/langgraph');
const { z } = require('zod');
const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

const LUNA = 'openai/gpt-6-luna';
const included = {
  usageMode: 'included',
  provider: 'openrouter',
  textChain: chain.defaultTextChainSettings(),
  passthroughModels: [],
};

const answer = (content, finish) =>
  new Response(
    JSON.stringify({
      id: 'gen',
      model: LUNA,
      choices: [
        { index: 0, finish_reason: finish, message: { role: 'assistant', content } },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

const draftInsideStreamEvents = async (disableStreaming, base) => {
  const model = new ChatOpenAI({
    apiKey: 'test',
    model: LUNA,
    maxTokens: 2000,
    maxRetries: 0,
    ...(disableStreaming ? { disableStreaming: true } : {}),
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      fetch: chain.createTextChainFetch(included, base, { budgetMs: 600_000 }),
    },
  }).withStructuredOutput(
    z.object({ content: z.object({ content: z.string() }) }),
    { method: 'jsonSchema' }
  );
  // Like `generateContent`: the node calls `invoke` without handing on the
  // graph's config; LangGraph carries the event handler there by itself.
  const State = Annotation.Root({ output: Annotation() });
  const graph = new StateGraph(State)
    .addNode('generate-content', async () => ({ output: await model.invoke('write') }))
    .addEdge(START, 'generate-content')
    .addEdge('generate-content', END)
    .compile();
  let output;
  for await (const event of graph.streamEvents({}, { streamMode: 'values', version: 'v2' })) {
    if (event.event === 'on_chain_stream' && event.data.chunk?.output)
      output = event.data.chunk.output;
  }
  return output;
};

describe('a chat model inside streamEvents', () => {
  let warn;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  test('without the flag LangChain sends a stream, which the cut-answer retry skips', async () => {
    const bodies = [];
    const base = async (_input, init) => {
      bodies.push(JSON.parse(init.body));
      throw new Error('stop here');
    };
    await expect(draftInsideStreamEvents(false, base)).rejects.toThrow();
    expect(bodies[0].stream).toBe(true);
  });

  test('with the flag the answer is whole, and a cut one is retried once', async () => {
    const bodies = [];
    const cut = '{"content":{"content":"Я заметил, что команда меньше пишет в чат, ко';
    const whole = '{"content":{"content":"Я заметил, что команда меньше пишет в чат."}}';
    const base = async (_input, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1 ? answer(cut, 'length') : answer(whole, 'stop');
    };

    const output = await draftInsideStreamEvents(true, base);

    expect(bodies.map((body) => body.stream ?? false)).toEqual([false, false]);
    expect(output).toEqual({
      content: { content: 'Я заметил, что команда меньше пишет в чат.' },
    });
    // The retry asks for twice the visible budget, plus the reasoning room.
    const cap = (body) => body.max_completion_tokens ?? body.max_tokens;
    expect(cap(bodies[1])).toBe(chain.withReasoningHeadroom(4000));
  });
});
