import { Global, Module } from '@nestjs/common';
import { AgentGraphService } from '@contentfactory/nestjs-libraries/agent/agent.graph.service';
import { AgentGraphInsertService } from '@contentfactory/nestjs-libraries/agent/agent.graph.insert.service';
// Вход одной мыслью стоит здесь, а не в `DatabaseModule`
// (`content-factory-next-tu3k.1`): единственный его сосед по модулю —
// `AgentGraphService`, которым он и пишет, а всё остальное (реестр источников,
// поиск, память фактов, каналы) приезжает из глобального `DatabaseModule`.
import { IntakeService } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service';
// Заготовки и адаптации — рядом с входом и по той же причине
// (`content-factory-next-tu3k.9`): `PieceService` пишет адаптацию тем же
// `AgentGraphService`, а его хранилище читает материалы и бриф из глобального
// `DatabaseModule`. Оба экспортируются, потому что контроллер живёт в
// `ApiModule` и инжектирует их оттуда.
import { PieceRepository } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.repository';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';

@Global()
@Module({
  providers: [
    AgentGraphService,
    AgentGraphInsertService,
    IntakeService,
    PieceRepository,
    PieceService,
  ],
  get exports() {
    return this.providers;
  },
})
export class AgentModule {}
