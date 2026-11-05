import { Global, Module } from '@nestjs/common';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import { AgentThreadsService } from '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service';
import { VIDEO_SUBSCRIPTION_RETURN_CONTEXT } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-return-context.v1';
import { AGENT_RUN_CLAIM_STORE } from '@contentfactory/nestjs-libraries/chat/conductor/agent-run-claims';
import { McpConfirmationService } from '@contentfactory/nestjs-libraries/chat/capabilities/mcp-confirmation';
import { TelegramAgentChannelService } from '@contentfactory/nestjs-libraries/chat/channels/telegram-agent-channel.service';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';

/**
 * The agent chat's providers (`content-factory-next-kcxz.7`): the Mastra
 * instance with its conductor, and the personal threads. The capabilities
 * reach the product's services through `ModuleRef`, so nothing here lists
 * them.
 */
@Global()
@Module({
  providers: [
    MastraService,
    AgentThreadsService,
    { provide: VIDEO_SUBSCRIPTION_RETURN_CONTEXT, useExisting: AgentThreadsService },
    TelegramAgentChannelService,
    // One answer per suspended run at a time, across instances (review W1 F5).
    { provide: AGENT_RUN_CLAIM_STORE, useValue: ioRedis },
    // A «Да» asked in the conversation over MCP, one-time codes (kcxz.49).
    McpConfirmationService,
  ],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
