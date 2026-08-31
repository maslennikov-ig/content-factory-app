import { TemporalModule } from 'nestjs-temporal-core';
import { socialIntegrationList } from '@contentfactory/nestjs-libraries/integrations/integration.manager';

// How many activity tasks one worker of this server may run at the same time.
//
// A provider's `maxConcurrentJob` is a statement about the provider's rate
// limit — TikTok says 10 000, Facebook 500 — not about what this server can
// carry. Every running activity holds a Prisma connection and an outbound HTTP
// request for its whole duration, so the number that matters here is ours.
//
// Prisma's pool is `num_physical_cpus * 2 + 1` unless `connection_limit` is set
// in `DATABASE_URL`, and it is not set in `deploy/production/env.example`. On a
// four-core host that is nine connections for the orchestrator, shared with the
// backend's own pool and with Temporal's, against PostgreSQL's default
// `max_connections` of 100. Twenty in-flight activities queue briefly on a pool
// of nine — Prisma waits `pool_timeout`, ten seconds by default — which short
// queries absorb, while two hundred would not.
//
// Twenty is also far above this instance's real load: one organization, a
// handful of channels. Raise it once a queue is measurably starved, and raise
// the pool with it.
const MAX_ACTIVITY_SLOTS_PER_QUEUE = 20;

// How many workflow executions the `main` worker keeps in its sticky cache.
//
// Left unset the SDK derives this from the heap limit —
// `max(floor(max(heapMiB - 200, 0) * 600 / 1024), 10)`, at
// `node_modules/@temporalio/worker/lib/worker-options.js:117-120`. Under
// `--max-old-space-size=512` inside a 2 GiB container that is 536 MiB of heap
// and 196 slots; on a developer machine the same flag yields 704 MiB and 295.
// A number that moves when the container's memory limit moves is not a setting,
// and the derivation assumes the whole heap belongs to the cache, when in this
// process it is shared with a Nest application and thirty-three workers.
//
// The SDK measured "approximately 1 MB per cached Workflow" with
// `reuseV8Context` enabled (`worker-options.d.ts:352`), so a hundred slots is
// about a hundred megabytes of a 512 MiB heap. Overflowing the cache costs a
// history replay on the next task, not a failure.
const MAX_CACHED_WORKFLOWS = 100;

// Workflow tasks here are short: they start an activity, or they sleep. The
// SDK's default of 40 is sized for a busy queue; ten is more than one
// organization's posting schedule ever asks for, and the option may not exceed
// `MAX_CACHED_WORKFLOWS`.
const MAX_CONCURRENT_WORKFLOW_TASKS = 10;

// "By default, set this value to half of `maxConcurrentWorkflowTaskExecutions`"
// and "keep this value low for Task Queues which have very few concurrent
// Workflow Executions" — `worker-options.d.ts:266-271`. Without this the
// default would be `min(10, 10)`, ten pollers holding long polls open against
// the Temporal server for a queue that is idle most of the day.
const MAX_CONCURRENT_WORKFLOW_TASK_POLLS = 5;

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  // Queues this worker server should NOT run, comma-separated
  // (e.g. EXCLUDE_QUEUE="reddit,x,twitch"). Use it to pin a queue to a single
  // server: exclude it on every server except the one that should own it.
  // Meant for the providers whose concurrency is too low to split (limit 1).
  const excludeQueues = (process.env.EXCLUDE_QUEUE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // How many worker servers share each (non-excluded) queue. Per-server
  // concurrency is divided by this so the GLOBAL concurrency stays correct.
  // 1 server => 1 (full), 2 servers => 2 (half each), 3 servers => 3, etc.
  const divider = Math.max(
    1,
    Number(process.env.WORKER_CONCURRENCY_DIVIDER) || 1
  );

  return TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
      ...(process.env.TEMPORAL_API_KEY
        ? { apiKey: process.env.TEMPORAL_API_KEY }
        : {}),
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(isWorkers
      ? {
          workers: [
            { identifier: 'main', maxConcurrentJob: undefined },
            ...socialIntegrationList,
          ]
            .filter((f) => f.identifier.indexOf('-') === -1)
            .map((integration) => ({
              integration,
              taskQueue: integration.identifier.split('-')[0],
            }))
            .filter(({ taskQueue }) => !excludeQueues.includes(taskQueue))
            .map(({ integration, taskQueue }) => {
              // Split the per-provider cap across the servers sharing this
              // queue. Floor (never below 1) so the global total never exceeds
              // the provider's limit. Providers whose limit is smaller than the
              // server count must be pinned via EXCLUDE_QUEUE instead.
              //
              // Then take the smaller of that and this server's own ceiling.
              // The ceiling only ever lowers the number, so the global total
              // still cannot exceed what the provider allows. `main` has no
              // provider limit at all and takes the ceiling directly; it used
              // to be handed 1 000 000, which is not a limit.
              const providerConcurrency = integration.maxConcurrentJob
                ? Math.max(
                    1,
                    Math.floor(integration.maxConcurrentJob / divider)
                  )
                : MAX_ACTIVITY_SLOTS_PER_QUEUE;

              const concurrency = Math.min(
                providerConcurrency,
                MAX_ACTIVITY_SLOTS_PER_QUEUE
              );

              return {
                taskQueue,
                // Only `main` runs workflows. Every provider queue carries
                // activity tasks and nothing else: each `workflow.start` in
                // this repository names `main`, `startChild` inherits its
                // parent's queue, and the provider queue travels as a workflow
                // *argument* into `proxyActivities({ taskQueue })`.
                //
                // Handing `workflowsPath` to the other thirty-two workers cost
                // a webpack build and a V8 sandbox thread each — measured at
                // about 40 MB a piece, which is where 1.34 GB of the
                // orchestrator went. Without it the worker is activity-only:
                // no bundle, no sandbox, no workflow pollers.
                //
                // If a workflow is ever started on a provider queue it will
                // wait forever with nothing to run it. Start it on `main`.
                ...(taskQueue === 'main' ? { workflowsPath: path! } : {}),
                activityClasses: activityClasses!,
                autoStart: true,
                workerOptions: {
                  maxConcurrentActivityTaskExecutions: concurrency,
                  // Only the worker that carries workflows has a cache to size
                  // or workflow tasks to run. `reuseV8Context` is left at its
                  // default of true: turning it off gives every cached workflow
                  // its own V8 context and doubles the worker's thread count.
                  ...(taskQueue === 'main'
                    ? {
                        maxCachedWorkflows: MAX_CACHED_WORKFLOWS,
                        maxConcurrentWorkflowTaskExecutions:
                          MAX_CONCURRENT_WORKFLOW_TASKS,
                        maxConcurrentWorkflowTaskPolls:
                          MAX_CONCURRENT_WORKFLOW_TASK_POLLS,
                      }
                    : {}),
                },
              };
            }),
        }
      : {}),
  });
};
