import { Injectable } from '@nestjs/common';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { agentCategories } from '@contentfactory/nestjs-libraries/agent/agent.categories';
import { z } from 'zod';
import { agentTopics } from '@contentfactory/nestjs-libraries/agent/agent.topics';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { getChatModel } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';

interface WorkflowChannelsState {
  // The organization whose AI key pays for this run.
  orgId: string;
  messages: BaseMessage[];
  topic?: string;
  category: string;
  hook?: string;
  content?: string;
}

const category = z.object({
  category: z.string().describe('The category for the post'),
});

const topic = z.object({
  topic: z.string().describe('The topic of the post'),
});

const hook = z.object({
  hook: z.string().describe('The hook of the post'),
});

@Injectable()
export class AgentGraphInsertService {
  constructor(
    private _postsService: PostsService,
    private readonly aiUsage: AiUsageService
  ) {}
  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: (): BaseMessage[] => [],
        },
        orgId: null,
        topic: null,
        category: null,
        hook: null,
        content: null,
      },
    });

  async findCategory(state: WorkflowChannelsState) {
    const { messages } = state;
    const structuredOutput = (
      await getChatModel(state.orgId, 0)
    ).withStructuredOutput(category);
    return ChatPromptTemplate.fromTemplate(
      `
You are an assistant that get a social media post and categorize it into to one from the following categories:
{categories}
Here is the post:
{post}
    `
    )
      .pipe(structuredOutput)
      .invoke({
        post: messages[0].content,
        categories: agentCategories.join(', '),
      });
  }

  async findTopic(state: WorkflowChannelsState) {
    const { messages } = state;
    const structuredOutput = (
      await getChatModel(state.orgId, 0)
    ).withStructuredOutput(topic);
    return ChatPromptTemplate.fromTemplate(
      `
You are an assistant that get a social media post and categorize it into one of the following topics:
{topics}
Here is the post:
{post}
    `
    )
      .pipe(structuredOutput)
      .invoke({
        post: messages[0].content,
        topics: agentTopics.join(', '),
      });
  }

  async findHook(state: WorkflowChannelsState) {
    const { messages } = state;
    const structuredOutput = (
      await getChatModel(state.orgId, 0)
    ).withStructuredOutput(hook);
    return ChatPromptTemplate.fromTemplate(
      `
You are an assistant that get a social media post and extract the hook, the hook is usually the first or second of both sentence of the post, but can be in a different place, make sure you don't change the wording of the post use the exact text:
{post}
    `
    )
      .pipe(structuredOutput)
      .invoke({
        post: messages[0].content,
      });
  }

  async savePost(state: WorkflowChannelsState) {
    await this._postsService.createPopularPosts({
      category: state.category,
      topic: state.topic!,
      hook: state.hook!,
      content: state.messages[0].content! as string,
    });

    return {};
  }

  newPost(orgId: string, post: string) {
    const state = AgentGraphInsertService.state();
    const workflow = state
      .addNode('find-category', this.findCategory)
      .addNode('find-topic', this.findTopic)
      .addNode('find-hook', this.findHook)
      .addNode('save-post', this.savePost.bind(this))
      .addEdge(START, 'find-category')
      .addEdge('find-category', 'find-topic')
      .addEdge('find-topic', 'find-hook')
      .addEdge('find-hook', 'save-post')
      .addEdge('save-post', END);

    const app = workflow.compile();
    return this.aiUsage.executeAiOperation(
      orgId,
      'content_classification',
      () =>
        app.invoke({
          orgId,
          messages: [new HumanMessage(post)],
        })
    );
  }
}
