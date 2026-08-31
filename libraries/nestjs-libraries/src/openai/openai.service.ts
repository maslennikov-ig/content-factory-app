import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { requireActiveAiConfig } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { getOpenAiClient } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

@Injectable()
export class OpenaiService {
  constructor(private readonly aiUsage: AiUsageService) {}

  generateImage(organizationId: string, prompt: string, isVertical = false) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'image_generation',
      () =>
        this.generateImageWithinOperation(organizationId, prompt, isVertical)
    );
  }

  generatePromptForPicture(organizationId: string, prompt: string) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.generatePromptForPictureWithinOperation(organizationId, prompt)
    );
  }

  generateVoiceFromText(organizationId: string, prompt: string) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.generateVoiceFromTextWithinOperation(organizationId, prompt)
    );
  }

  generatePosts(organizationId: string, content: string) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.generatePostsWithinOperation(organizationId, content)
    );
  }

  extractWebsiteText(organizationId: string, content: string) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.extractWebsiteTextWithinOperation(organizationId, content)
    );
  }

  separatePosts(organizationId: string, content: string, len: number) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.separatePostsWithinOperation(organizationId, content, len)
    );
  }

  generateSlidesFromText(organizationId: string, text: string) {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'text_generation',
      () => this.generateSlidesFromTextWithinOperation(organizationId, text)
    );
  }

  private async generateImageWithinOperation(
    organizationId: string,
    prompt: string,
    isVertical = false
  ) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3.
    const generate = (
      await (
        await getOpenAiClient(organizationId)
      ).images.generate({
        prompt,
        model: (await requireActiveAiConfig(organizationId)).imageModel,
        size: isVertical ? '1024x1536' : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  private async generatePromptForPictureWithinOperation(
    organizationId: string,
    prompt: string
  ) {
    return (
      (
        await (
          await getOpenAiClient(organizationId)
        ).chat.completions.parse({
          model: (await requireActiveAiConfig(organizationId)).textModel,
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  private async generateVoiceFromTextWithinOperation(
    organizationId: string,
    prompt: string
  ) {
    return (
      (
        await (
          await getOpenAiClient(organizationId)
        ).chat.completions.parse({
          model: (await requireActiveAiConfig(organizationId)).textModel,
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  private async generatePostsWithinOperation(
    organizationId: string,
    content: string
  ) {
    const posts = (
      await Promise.all([
        (
          await getOpenAiClient(organizationId)
        ).chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: (await requireActiveAiConfig(organizationId)).textModel,
        }),
        (
          await getOpenAiClient(organizationId)
        ).chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: (await requireActiveAiConfig(organizationId)).textModel,
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  private async extractWebsiteTextWithinOperation(
    organizationId: string,
    content: string
  ) {
    const websiteContent = await (
      await getOpenAiClient(organizationId)
    ).chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: (await requireActiveAiConfig(organizationId)).textModel,
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePostsWithinOperation(organizationId, articleContent!);
  }

  private async separatePostsWithinOperation(
    organizationId: string,
    content: string,
    len: number
  ) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await (
          await getOpenAiClient(organizationId)
        ).chat.completions.parse({
          model: (await requireActiveAiConfig(organizationId)).textModel,
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await (
                    await getOpenAiClient(organizationId)
                  ).chat.completions.parse({
                    model: (
                      await requireActiveAiConfig(organizationId)
                    ).textModel,
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  private async generateSlidesFromTextWithinOperation(
    organizationId: string,
    text: string
  ) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await (
              await getOpenAiClient(organizationId)
            ).chat.completions.parse({
              model: (await requireActiveAiConfig(organizationId)).textModel,
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
