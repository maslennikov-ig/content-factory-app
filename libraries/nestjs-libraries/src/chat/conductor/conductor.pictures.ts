import type { Processor, ProcessLLMRequestArgs } from '@mastra/core/processors';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
} from '@mastra/core/request-context';
import { viewedPictureMarker, type ViewedPicture } from './agent-chat.request';
import { CONDUCTOR_REQUEST_ID_KEY } from './conductor.context';

/**
 * Pictures the agent looks at (owner decision 28.09.2026, «агент видит
 * картинки»; review W4-25 F2).
 *
 * A picture attached in the chat for the agent to look at reaches the model
 * inline, in the request that carries it, and is saved nowhere: not in the
 * media library, not in the thread's history, not in a run snapshot. The chat
 * door turns each one into a short placeholder line — that line is what the
 * message holds, what memory stores and what a reloaded thread shows — and
 * hands the bytes to this module for the length of the request. The
 * `ViewedPictures` processor puts the picture back beside its line in the
 * prompt Mastra sends to the provider (`processLLMRequest`: a rewrite of the
 * outgoing prompt only, never persisted to the message list or memory —
 * `@mastra/core` 1.71). The request context carries only the request's id:
 * Mastra persists it in a suspended run's snapshot, and its values are
 * primitives only (`CONDUCTOR_CONTEXT_KEYS`).
 *
 * To put such a picture on a post the agent asks the person's browser, which
 * still holds it, to put it into the library (`media.keep`, by the
 * `pictureKey` the browser gave it); the model never uploads bytes.
 */

/**
 * The pictures of one request in flight (review W4-25 vision F3): held under
 * the request's own server-made id (`CONDUCTOR_REQUEST_ID_KEY`), never under
 * the thread — two requests of one thread (a second tab, a double send)
 * neither see nor let go each other's pictures. The memory resource and the
 * thread are kept beside them and must match too.
 */
type Held = {
  resourceId: string;
  threadId: string;
  pictures: ViewedPicture[];
  /** Whether the last model step of this request carried the pictures. */
  lastStepShown: boolean;
};
const inFlight = new Map<string, Held>();

export type PictureHold = {
  /** Lets the pictures go; the door calls it in `finally`. */
  release: () => void;
  /**
   * Whether the model step that ran last carried the pictures — a provider
   * refusal of that step is then about the picture (review W4-25 vision F5).
   */
  lastStepShown: () => boolean;
};

const NOTHING_HELD: PictureHold = { release: () => undefined, lastStepShown: () => false };

/** Holds the request's pictures for the processor, under the request's id. */
export const holdViewedPictures = (
  requestId: string,
  resourceId: string,
  threadId: string,
  pictures: readonly ViewedPicture[]
): PictureHold => {
  if (!pictures.length) return NOTHING_HELD;
  const held: Held = { resourceId, threadId, pictures: [...pictures], lastStepShown: false };
  inFlight.set(requestId, held);
  return {
    release: () => {
      if (inFlight.get(requestId) === held) inFlight.delete(requestId);
    },
    lastStepShown: () => held.lastStepShown,
  };
};

type PromptMessage = ProcessLLMRequestArgs['prompt'][number];

/**
 * Puts each held picture back beside its line in the outgoing prompt of the
 * request's **first** model step only (owner decision 28.09.2026, review
 * W4-25 vision F4): the model looks at the picture once, when it starts its
 * answer, and later steps of the same answer read the line alone — so one
 * `agent` operation never carries the pictures up to seven times. A line
 * whose picture is not held — an earlier message, a reloaded thread, another
 * request — stays a line.
 */
export class ViewedPicturesProcessor implements Processor<'viewed-pictures'> {
  readonly id = 'viewed-pictures' as const;
  readonly name = 'Viewed pictures';

  processLLMRequest({ prompt, requestContext, stepNumber }: ProcessLLMRequestArgs) {
    const context = requestContext as { get: (key: string) => unknown } | undefined;
    const requestId = context?.get(CONDUCTOR_REQUEST_ID_KEY);
    const resourceId = context?.get(MASTRA_RESOURCE_ID_KEY);
    const threadId = context?.get(MASTRA_THREAD_ID_KEY);
    if (typeof requestId !== 'string') return undefined;
    const held = inFlight.get(requestId);
    if (!held || held.resourceId !== resourceId || held.threadId !== threadId) return undefined;
    held.lastStepShown = false;
    if ((stepNumber ?? 0) > 0) return undefined;
    let changed = false;
    const next = prompt.map((message): PromptMessage => {
      if (message.role !== 'user') return message;
      const content: Array<(typeof message.content)[number]> = [];
      for (const part of message.content) {
        content.push(part);
        if (part.type !== 'text') continue;
        for (const picture of held.pictures) {
          if (!part.text.includes(viewedPictureMarker(picture.ref))) continue;
          content.push({
            type: 'file',
            data: picture.data,
            mediaType: picture.mediaType,
            ...(picture.filename ? { filename: picture.filename } : {}),
          });
          changed = true;
        }
      }
      return { ...message, content };
    });
    held.lastStepShown = changed;
    return changed ? { prompt: next } : undefined;
  }
}
