export type TelegramUpdateAction =
  | {
      kind: 'connect';
      word: string;
      chatId: string;
      messageId: string;
    }
  | {
      kind: 'reaction-count';
      chatId: string;
      messageId: string;
      total: number;
    }
  | {
      kind: 'discussion-forward';
      channelChatId: string;
      channelMessageId: string;
      discussionChatId: string;
      discussionMessageId: string;
    }
  | {
      kind: 'discussion-reply';
      discussionChatId: string;
      discussionMessageId: string;
      parentDiscussionMessageId: string;
    }
  | {
      kind: 'support-relay';
      sourceChatId: string;
      sourceMessageId: number;
    };

type TelegramMessageLike = {
  chat?: {
    id?: string | number;
    type?: 'private' | 'group' | 'supergroup' | 'channel' | string;
  };
  message_id?: string | number;
  text?: string;
  is_automatic_forward?: boolean;
  forward_origin?: {
    type?: string;
    chat?: { id?: string | number };
    message_id?: string | number;
  };
  forward_from_chat?: { id?: string | number };
  forward_from_message_id?: string | number;
  reply_to_message?: { message_id?: string | number };
};

export type TelegramUpdateLike = {
  update_id: number;
  message?: TelegramMessageLike;
  channel_post?: TelegramMessageLike;
  message_reaction_count?: {
    chat?: { id?: string | number };
    message_id?: string | number;
    reactions?: Array<{ total_count?: number }>;
  };
};

const present = (value: unknown): value is string | number =>
  value !== undefined && value !== null;

const connectWord = (text?: string) =>
  text?.match(/^\/connect\s+([A-Za-z0-9_-]+)\s*$/)?.[1];

export function parseTelegramUpdate(
  update: TelegramUpdateLike
): TelegramUpdateAction[] {
  const actions: TelegramUpdateAction[] = [];
  const reaction = update.message_reaction_count;

  if (present(reaction?.chat?.id) && present(reaction?.message_id)) {
    actions.push({
      kind: 'reaction-count',
      chatId: String(reaction.chat.id),
      messageId: String(reaction.message_id),
      total: (reaction.reactions || []).reduce(
        (sum, item) => sum + Math.max(0, Number(item.total_count) || 0),
        0
      ),
    });
  }

  const incoming = update.message || update.channel_post;
  if (
    !incoming ||
    !present(incoming.chat?.id) ||
    !present(incoming.message_id)
  ) {
    return actions;
  }

  const word = connectWord(incoming.text);
  if (word) {
    actions.push({
      kind: 'connect',
      word,
      chatId: String(incoming.chat.id),
      messageId: String(incoming.message_id),
    });
  }

  const numericMessageId = Number(incoming.message_id);
  if (
    update.message === incoming &&
    incoming.chat?.type === 'private' &&
    !word &&
    Number.isSafeInteger(numericMessageId) &&
    numericMessageId > 0
  ) {
    actions.push({
      kind: 'support-relay',
      sourceChatId: String(incoming.chat.id),
      sourceMessageId: numericMessageId,
    });
  }

  const origin = incoming.forward_origin;
  const channelChatId =
    origin?.type === 'channel'
      ? origin.chat?.id
      : incoming.forward_from_chat?.id;
  const channelMessageId =
    origin?.type === 'channel'
      ? origin.message_id
      : incoming.forward_from_message_id;

  if (
    incoming.is_automatic_forward &&
    present(channelChatId) &&
    present(channelMessageId)
  ) {
    actions.push({
      kind: 'discussion-forward',
      channelChatId: String(channelChatId),
      channelMessageId: String(channelMessageId),
      discussionChatId: String(incoming.chat.id),
      discussionMessageId: String(incoming.message_id),
    });
  } else if (present(incoming.reply_to_message?.message_id)) {
    actions.push({
      kind: 'discussion-reply',
      discussionChatId: String(incoming.chat.id),
      discussionMessageId: String(incoming.message_id),
      parentDiscussionMessageId: String(incoming.reply_to_message.message_id),
    });
  }

  return actions;
}
