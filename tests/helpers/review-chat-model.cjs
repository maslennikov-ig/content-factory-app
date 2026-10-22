'use strict';

/** Reuse recorded provider answers while exercising the review's invoke seam. */
const reviewChatModelMock = (clients) => async (org, _temperature, maxTokens, role) => ({
  async invoke(messages, options) {
    const client = await clients.getOpenAiClient(org);
    const response = await client.chat.completions.create({
      model: await clients.getModelForRole(org, role),
      messages,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...options,
    });
    return { content: response.choices[0]?.message.content ?? '' };
  },
});

module.exports = { reviewChatModelMock };
