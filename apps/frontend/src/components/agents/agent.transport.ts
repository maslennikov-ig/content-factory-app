import { DefaultChatTransport } from 'ai';
import { getTimezone } from '@contentfactory/frontend/components/layout/set.timezone';
import {
  AGENT_DOORS,
  AGENT_THREAD_HEADER,
  AGENT_TIMEZONE_HEADER,
  buildChatBody,
  continuedCallChunk,
  readResumeOption,
  type AgentMessage,
} from './agent.contract';

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

/**
 * The zone the screens read and write times in — exactly theirs, not the
 * machine's (review W2 F5): `getTimezone()` of `set.timezone.tsx`, the zone
 * chosen in the profile (`localStorage.timezone`), else dayjs's guess of the
 * browser's. The calendar and the plan use the same helper. The server checks
 * it and falls back on the saved offset, then UTC.
 */
export const screenTimeZone = (): string => {
  try {
    return getTimezone() || '';
  } catch {
    return '';
  }
};

/**
 * The SDK's transport, with one addition (`kcxz.32`, D2): the stream of an
 * answer on a question card further up first names the call it continues in
 * the message that takes it (`continuedCallChunk`); everything else is the
 * SDK's own.
 */
class AgentChatTransport extends DefaultChatTransport<AgentMessage> {
  async sendMessages(
    options: Parameters<DefaultChatTransport<AgentMessage>['sendMessages']>[0]
  ) {
    const stream = await super.sendMessages(options);
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
  onThread,
}: {
  request: ProductFetch;
  /** The thread the next request writes to; `null` opens a new one. */
  currentThread: () => string | null;
  /** The server named the thread in `AGENT_THREAD_HEADER`. */
  onThread: (id: string) => void;
}) =>
  new AgentChatTransport({
    api: AGENT_DOORS.chat,
    fetch: async (input, init) => {
      const response = await request(String(input), init ?? {});
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
      }),
    }),
  });
