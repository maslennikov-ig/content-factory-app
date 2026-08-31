import { IntegrationValidationTool } from '@contentfactory/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@contentfactory/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@contentfactory/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@contentfactory/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@contentfactory/nestjs-libraries/chat/tools/generate.video.tool';
import { GenerateImageTool } from '@contentfactory/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@contentfactory/nestjs-libraries/chat/tools/integration.list.tool';
import { GroupListTool } from '@contentfactory/nestjs-libraries/chat/tools/group.list.tool';
import { UploadFromUrlTool } from '@contentfactory/nestjs-libraries/chat/tools/upload.from.url.tool';
import { WebResearchTool } from '@contentfactory/nestjs-libraries/chat/tools/web.research.tool';

export const toolList = [
  IntegrationListTool,
  GroupListTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  GenerateImageTool,
  UploadFromUrlTool,
  WebResearchTool,
];
