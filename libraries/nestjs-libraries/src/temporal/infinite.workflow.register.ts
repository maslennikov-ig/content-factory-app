import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      try {
        // Retire only the product's previous recovery roots before the guarded successor starts.
        for (const workflowId of ['missing-post-workflow-v108']) {
          try { await this._temporalService.client.getRawClient().workflow.getHandle(workflowId).terminate('guarded campaign publication recovery v110'); }
          catch (error: any) { if (error?.name !== 'WorkflowNotFoundError' && !/not found|already completed/i.test(String(error?.message))) throw error; }
        }
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflowV110', {
            workflowId: 'missing-post-workflow-v110',
            taskQueue: 'main',
            workflowIdConflictPolicy: 'USE_EXISTING',
          });
      } catch (err) { throw new Error('PUBLICATION_RECOVERY_MIGRATION_FAILED'); }
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
