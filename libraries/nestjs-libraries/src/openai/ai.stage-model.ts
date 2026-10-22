import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatOpenAICallOptions } from '@langchain/openai';
import type {
  BaseLanguageModelInput,
  StructuredOutputMethodOptions,
} from '@langchain/core/language_models/base';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { RunnableLambda } from '@langchain/core/runnables';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { PublicSchema } from '@mastra/core/schema';
import type { AiRole } from './ai.roles';
import type { MastraModelEntry } from './ai.clients';
import {
  createNativeTextRetryConfig,
  nativeTextAbortSignal,
  setNativeTextMaxRetries,
} from './ai.native-retries';

type StageModelOptions = {
  organizationId: string;
  role: AiRole;
  temperature?: number;
  maxTokens?: number;
};

export type StageCallOptions = ChatOpenAICallOptions;

type NativeCallOptions = Parameters<MastraModelEntry['model']['doGenerate']>[0];

/** Raw JSON mode leaves validation and its single repair with the consumer. */
const jsonObjectModel = (model: MastraModelEntry['model']) => new Proxy(model, {
  get(target, property) {
    if (property === 'doGenerate') return (options: NativeCallOptions) =>
      target.doGenerate({ ...options, responseFormat: { type: 'json' } });
    if (property === 'doStream') return (options: NativeCallOptions) =>
      target.doStream({ ...options, responseFormat: { type: 'json' } });
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

/** Keeps the existing LangChain stage boundary while Mastra owns generation. */
class NativeStageChatModel extends BaseChatModel<StageCallOptions> {
  disableStreaming = true;

  constructor(private readonly stage: StageModelOptions) {
    super({ maxRetries: 0, disableStreaming: true });
  }

  _llmType() {
    return 'content-factory-native-stage';
  }

  get callKeys() {
    return [...super.callKeys, 'response_format'];
  }

  private async generateStage(
    messages: BaseMessage[],
    options: Pick<StageCallOptions, 'signal' | 'stop' | 'response_format' | 'options'>,
    schema?: unknown
  ) {
    const signal = nativeTextAbortSignal(options.signal, options.options?.signal ?? undefined);
    signal?.throwIfAborted();
    if (options.response_format && !['text', 'json_object'].includes(options.response_format.type)) {
      throw new Error('Native stage schemas must use withStructuredOutput.');
    }
    const prompt = messages.map((message) => {
      if (typeof message.content !== 'string') {
        throw new Error('Native stage generation requires text system, user, or assistant messages.');
      }
      const kind = message.getType();
      if (kind === 'human') return { role: 'user' as const, content: message.content };
      if (kind === 'ai') return { role: 'assistant' as const, content: message.content };
      if (kind === 'system') return { role: 'system' as const, content: message.content };
      throw new Error('Native stage generation requires text system, user, or assistant messages.');
    });
    const requestContext = new RequestContext();
    // Invoke-time loading avoids a factory import cycle. Resolve once for this
    // prompt, then give native preflight a concrete array rather than a router.
    const { getRoutedMastraModelEntries } = await import('./ai.clients');
    const selection = await getRoutedMastraModelEntries(
      this.stage.organizationId, this.stage.role, prompt, { requestContext }
    );
    signal?.throwIfAborted();
    setNativeTextMaxRetries(requestContext, selection.policy.maxRetries,
      selection.entries.map((entry) => entry.model.modelId));
    const agent = new Agent({
      id: `content-factory-stage-${this.stage.role}`,
      name: `Content Factory ${this.stage.role}`,
      instructions: '',
      model: options.response_format?.type === 'json_object'
        ? selection.entries.map((entry) => ({ ...entry, model: jsonObjectModel(entry.model) }))
        : selection.entries,
      ...createNativeTextRetryConfig(),
    });
    const generation = {
      requestContext,
      abortSignal: signal,
      maxSteps: 1,
      modelSettings: {
        temperature: this.stage.temperature ?? 0.7,
        ...(this.stage.maxTokens ? { maxOutputTokens: this.stage.maxTokens } : {}),
        ...(options.stop ? { stopSequences: options.stop } : {}),
        maxRetries: 0,
      },
    };
    const result = schema === undefined
      ? await agent.generate(prompt, generation)
      : await agent.generate(prompt, {
          ...generation,
          structuredOutput: { schema: schema as PublicSchema },
        });
    if (result.error) throw result.error;
    return result;
  }

  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const result = await this.generateStage(messages, options);
    return { generations: [{ text: result.text, message: new AIMessage(result.text) }] };
  }

  withStructuredOutput: BaseChatModel<StageCallOptions>['withStructuredOutput'] = ((
    schema: unknown,
    config?: StructuredOutputMethodOptions<boolean>
  ) => RunnableLambda.from(async (input: BaseLanguageModelInput, options) => {
    const messages = NativeStageChatModel._convertInputToPromptValue(input).toChatMessages();
    const result = await this.generateStage(messages, options, schema);
    // Native generation already validates and transforms through the original
    // schema. Parsing again could apply a transform twice.
    if (result.object === undefined) throw new Error('Native stage generation returned no structured object.');
    return config?.includeRaw
      ? { raw: new AIMessage(result.text), parsed: result.object }
      : result.object;
  })) as BaseChatModel<StageCallOptions>['withStructuredOutput'];
}

export const createNativeStageChatModel = (options: StageModelOptions) =>
  new NativeStageChatModel(options);
