import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.RUN_CRON === 'true' || process.env.RUN_CRON === '1') {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflowV111', {
            workflowId: 'missing-post-workflow-v111',
            taskQueue: 'main',
            workflowIdConflictPolicy: 'USE_EXISTING',
          });
        // Start the successor before retiring ONLY control-plane recovery roots.
        // Existing post_<id> jobs and repeat children retain their exact versions.
        for (const workflowId of ['missing-post-workflow-v108', 'missing-post-workflow-v110']) {
          try { await this._temporalService.client.getRawClient().workflow.getHandle(workflowId).terminate('publication heartbeat recovery v111'); }
          catch (error: any) { if (error?.name !== 'WorkflowNotFoundError' && !/not found|already completed/i.test(String(error?.message))) throw error; }
        }
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
