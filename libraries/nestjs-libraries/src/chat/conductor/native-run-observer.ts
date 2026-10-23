import { randomUUID } from 'node:crypto';
import {
  AGENT_STREAM_TOPIC,
  createDurableAgentStream,
  type DurableAgent,
  type StreamAdapterOptions,
  type StreamAdapterResult,
} from '@mastra/core/agent/durable';
import { conductorOutputProcessors } from './conductor.secrets';

type Agent = DurableAgent<any, any, any>;
type ObserveOptions = NonNullable<Parameters<Agent['observe']>[1]> & {
  /** Positive owned-task and saved-assistant proof supplied by the caller. */
  isComplete?: () => Promise<boolean>;
};

export class NativeReplayCompleteError extends Error {
  readonly code = 'NATIVE_REPLAY_COMPLETE';
  constructor() {
    super('The completed native response is available in saved history.');
    this.name = 'NativeReplayCompleteError';
  }
}

/**
 * Mastra 1.78's observe() shares the producer's processor state and MessageList.
 * Replaying through that state consumes its secret-filter carryover and can
 * remove live text from both the response and Memory. The public stream adapter
 * supplies the same native replay and generation filtering with reader-local
 * redaction state. A reader never receives the producer's execution context.
 */
export async function observeConductorRun(
  agent: Agent,
  runId: string,
  options: ObserveOptions = {}
) {
  const { isComplete, ...nativeOptions } = options;
  const readGeneration = async () => {
    const workflows = await agent
      .getMastraInstance()
      ?.getStorage()
      ?.getStore('workflows');
    if (!workflows || !(await workflows.supportsRunFencing())) return;
    return (await workflows.getRunOwnership({ runId }))?.generation;
  };

  // A numeric offset skips lifecycle markers too. Preserve the native floor
  // from those skipped events so a superseded owner's terminal cannot end this
  // reader. With no offset, the adapter learns each generation during replay.
  let replayFloor: Pick<StreamAdapterOptions, 'minGeneration'> = {};
  if (options.offset) {
    try {
      const skipped = (
        await agent.pubsub.getHistory(AGENT_STREAM_TOPIC(runId), 0)
      ).slice(0, options.offset);
      if (skipped.length === options.offset) {
        let floor: number | undefined;
        for (const event of skipped) {
          if (
            typeof event.generation === 'number' &&
            (floor === undefined || event.generation > floor)
          )
            floor = event.generation;
        }
        replayFloor = { minGeneration: floor };
      } else {
        replayFloor = { minGeneration: await readGeneration() };
      }
    } catch {
      // Terminal-time claim reads are asynchronous: a stale delta can arrive
      // while that read is pending. Seed Mastra's native filter before the
      // subscription starts; propagate storage failures rather than leak text.
      replayFloor = { minGeneration: await readGeneration() };
    }
  }

  const stream: StreamAdapterResult = createDurableAgentStream({
    pubsub: agent.pubsub,
    runId,
    messageId: randomUUID(),
    model: { modelId: undefined, provider: undefined, version: 'v3' },
    ...nativeOptions,
    ...replayFloor,
    outputProcessors: conductorOutputProcessors(),
    processorStates: new Map(),
    onStreamFinished: () => stream.detach(),
    onError: async (data) => {
      try {
        await options.onError?.(data);
      } finally {
        stream.detach();
      }
    },
    onAbort: async (data) => {
      try {
        await options.onAbort?.(data);
      } finally {
        stream.detach();
      }
    },
  });
  try {
    await stream.ready;
    // untilIdle may clear the native topic between the caller's completion
    // check and this subscription. Empty replay alone is never a terminal
    // receipt; the caller must also prove the exact saved assistant is done.
    if (
      isComplete &&
      (await agent.pubsub.getHistory(AGENT_STREAM_TOPIC(runId))).length === 0 &&
      (await isComplete())
    ) {
      throw new NativeReplayCompleteError();
    }
  } catch (error) {
    stream.detach();
    throw error;
  }
  return {
    output: stream.output,
    get fullStream() {
      return stream.output.fullStream;
    },
    runId,
    detach: stream.detach,
  };
}
