import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';

/**
 * A state signal or restored step can leave the active response ID pointing
 * behind a newer assistant row. Appending to that ID would merge a new tool
 * call into old history. Let Mastra seal and rotate its response instead.
 */
export class NativeResponseBoundaryProcessor implements Processor<'native-response-boundary'> {
  readonly id = 'native-response-boundary' as const;

  processInputStep({ messageList, messageId, rotateResponseMessageId }: ProcessInputStepArgs): ProcessInputStepResult | undefined {
    if (!messageId || !rotateResponseMessageId) return;
    const assistants = messageList.get.all.db().filter(message => message.role === 'assistant');
    const current = assistants.findIndex(message => message.id === messageId);
    if (current < 0 || current === assistants.length - 1) return;
    return { messageId: rotateResponseMessageId() };
  }
}
