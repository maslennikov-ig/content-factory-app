import { DefaultChatTransport } from 'ai';
import { screenTimeZone } from '@contentfactory/frontend/components/layout/set.timezone';
import {
  AGENT_DOORS,
  AGENT_THREAD_HEADER,
  AGENT_NOT_STARTED_HEADER,
  AGENT_TIMEZONE_HEADER,
  buildChatBody,
  continuedCallChunk,
  readResumeOption,
  readAgentWorkContext,
  readThreadHistory,
  type AgentMessage,
  type AgentWorkContextV1,
} from './agent.contract';
import { assistantContextKey } from './assistant.route-context';

/**
 * The chat's transport, in one place (`content-factory-next-kcxz.29`, D1).
 *
 * The AI SDK's own `DefaultChatTransport`, pointed at `POST /agent/chat`
 * through the product's fetch (`useFetch`: auth, workspace header, the shared
 * refusal handler). It lives outside the component so a test drives exactly
 * this composition — the SDK's headers through our fetch onto a real JSON
 * body parser — instead of a mock that hides what the two add together. The
 * walk of 27.09.2026 found every message refused because the two named
 * `content-type` twice (`tests/agent-transport.test.cjs`).
 */

type ProductFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Explicit server refusal, or local preparation that never attempted the chat POST. */
export class AgentRequestNotStartedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AgentRequestNotStartedError';
  }
}

export const isAgentRequestNotStarted = (
  error: unknown
): error is AgentRequestNotStartedError => error instanceof AgentRequestNotStartedError;

/**
 * The zone the screens read and write times in (`screenTimeZone`, now beside
 * `getTimezone()` in `set.timezone.tsx`, where the fact form reads it too —
 * `kcxz.43`). Re-exported: the chat's screens import it from here.
 */
export { screenTimeZone };

/**
 * The SDK's transport, with one addition (`kcxz.32`, D2): the stream of an
 * answer on a question card further up first names the call it continues in
 * the message that takes it (`continuedCallChunk`); everything else is the
 * SDK's own.
 */
type SendOptions = Parameters<DefaultChatTransport<AgentMessage>['sendMessages']>[0];

class AgentChatTransport extends DefaultChatTransport<AgentMessage> {
  constructor(
    options: ConstructorParameters<typeof DefaultChatTransport<AgentMessage>>[0],
    private readonly prepare: (options: SendOptions) => Promise<SendOptions>
  ) { super(options); }

  async sendMessages(options: SendOptions) {
    const stream = await super.sendMessages(await this.prepare(options));
    const first = continuedCallChunk(options.messages, readResumeOption(options.body));
    if (!first) return stream;
    let announced = false;
    return stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (!announced) {
            announced = true;
            controller.enqueue(first as typeof chunk);
          }
          controller.enqueue(chunk);
        },
      })
    );
  }
}

export const createAgentTransport = ({
  request,
  currentThread,
  currentContext,
  onThread,
  onNotStarted,
}: {
  request: ProductFetch;
  /** The thread the next request writes to; `null` opens a new one. */
  currentThread: () => string | null;
  /** Read at send time so manual navigation never captures an old object. */
  currentContext?: () => AgentWorkContextV1 | null | undefined;
  /** The server named the thread in `AGENT_THREAD_HEADER`. */
  onThread: (id: string) => void;
  /** Positive proof: local preparation or the server refused before starting. */
  onNotStarted?: () => void;
}) =>
  new AgentChatTransport({
    api: AGENT_DOORS.chat,
    fetch: async (input, init) => {
      if (init?.signal?.aborted) {
        onNotStarted?.();
        init.signal.throwIfAborted();
      }
      const response = await request(String(input), init ?? {});
      if (!response.ok && response.headers.get(AGENT_NOT_STARTED_HEADER) === '1') {
        onNotStarted?.();
        throw new AgentRequestNotStartedError(await response.text(), response.status);
      }
      const named = response.headers.get(AGENT_THREAD_HEADER);
      if (named && named !== currentThread()) onThread(named);
      return response;
    },
    // The SDK's own headers pass through unchanged (one `content-type`,
    // `tests/agent-transport.test.cjs`); only the zone is added.
    prepareSendMessagesRequest: ({ messages, messageId, body, headers }) => ({
      headers: {
        ...Object.fromEntries(new Headers(headers as HeadersInit | undefined).entries()),
        ...(screenTimeZone() ? { [AGENT_TIMEZONE_HEADER]: screenTimeZone() } : {}),
      },
      body: buildChatBody({
        threadId: currentThread(),
        messages,
        // An answer on an approval card further up names its message (N1).
        messageId,
        resume: readResumeOption(body),
        workContext: body && Object.prototype.hasOwnProperty.call(body, 'workContext')
          ? readAgentWorkContext(body.workContext)
          : currentContext?.(),
      }),
    }),
  }, async (options) => {
    const id = currentThread();
    const context = currentContext?.();
    const explicitContext = options.body && Object.prototype.hasOwnProperty.call(options.body, 'workContext');
    const intent = buildChatBody({ threadId: id, messages: options.messages, messageId: options.messageId, resume: readResumeOption(options.body) });
    // Queued targets, regeneration and native cards keep their original binding.
    // Only a new deliberate instruction should see the latest manual version.
    if (options.trigger !== 'submit-message' || explicitContext || !id || !context?.revision || intent.messages[0]?.role !== 'user') return options;
    try {
      options.abortSignal?.throwIfAborted();
      const zone = screenTimeZone();
      const response = await request(AGENT_DOORS.thread(id), {
        signal: options.abortSignal,
        ...(zone ? { headers: { [AGENT_TIMEZONE_HEADER]: zone } } : {}),
      });
      if (!response.ok) throw new AgentRequestNotStartedError(JSON.stringify({ code: 'AGENT_BAD_REQUEST' }), response.status);
      const refreshed = readThreadHistory(await response.json()).workspace?.workContext;
      options.abortSignal?.throwIfAborted();
      const key = assistantContextKey(context);
      if (currentThread() !== id || key !== assistantContextKey(currentContext?.() ?? null) || !refreshed?.revision || key !== assistantContextKey(refreshed)) {
        throw new AgentRequestNotStartedError(JSON.stringify({ code: 'AGENT_BAD_REQUEST' }), 409);
      }
      return { ...options, body: { ...options.body, workContext: refreshed } };
    } catch (error) {
      onNotStarted?.();
      options.abortSignal?.throwIfAborted();
      if (isAgentRequestNotStarted(error)) throw error;
      throw new AgentRequestNotStartedError(JSON.stringify({ code: 'AGENT_BAD_REQUEST' }), 503);
    }
  });
