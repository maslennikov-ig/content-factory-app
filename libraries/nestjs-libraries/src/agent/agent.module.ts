import { Global, Module } from '@nestjs/common';
import { AgentGraphService } from '@contentfactory/nestjs-libraries/agent/agent.graph.service';
import { AgentGraphInsertService } from '@contentfactory/nestjs-libraries/agent/agent.graph.insert.service';
// Вход одной мыслью стоит здесь, а не в `DatabaseModule`
// (`content-factory-next-tu3k.1`): единственный его сосед по модулю —
// `AgentGraphService`, которым он и пишет, а всё остальное (реестр источников,
// поиск, память фактов, каналы) приезжает из глобального `DatabaseModule`.
import { IntakeService } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service';

@Global()
@Module({
  providers: [AgentGraphService, AgentGraphInsertService, IntakeService],
  get exports() {
    return this.providers;
  },
})
export class AgentModule {}
