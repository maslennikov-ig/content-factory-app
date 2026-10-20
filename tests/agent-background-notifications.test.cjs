'use strict';

/**
 * Native Mastra 1.78.0 `BackgroundTaskManager` (`@mastra/core/background-tasks`)
 * and `NotificationsStorage` / `createNotificationInboxTool`
 * (`@mastra/core/notifications`) (`content-factory-next-bxeb.4`):
 * - `MastraService` registers `backgroundTasks: { enabled: true }` and records
 *   notifications on background task and schedule completion/error;
 * - `conductor.autonomy.ts` exposes `notification_inbox` with strict
 *   `resourceId` (`{orgId}:{userId}`) isolation;
 * - `GET /agent/notifications`, `POST /agent/notifications/:id/read`, and
 *   `POST /agent/notifications/read-all` return only the caller's own
 *   notifications and background tasks with redacted secrets;
 * - `ThreadSwitcher` renders `AgentNotificationsBell` (`Popover` inbox).
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  IDENTITY,
  loadCapabilityModule,
} = require('./helpers/agent-capabilities.cjs');
const { InMemoryNotificationsStorage } = require('@mastra/core/notifications');
const { RequestContext } = require('@mastra/core/request-context');

const root = path.resolve(__dirname, '..');

const esmStubs = {
  '@mastra/memory': { Memory: class {} },
  '@mastra/ai-sdk/ui': { toAISdkMessages: (msgs) => msgs },
  '@contentfactory/nestjs-libraries/chat/mastra.service': {
    MastraService: class {},
  },
  '@mastra/core/processors': {
    ToolSearchProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
  },
};

describe('BackgroundTaskManager and Notifications Inbox (bxeb.4)', () => {
  test('MastraService wires backgroundTasks and notification hooks on schedules and background tasks', () => {
    const source = fs.readFileSync(
      path.join(root, 'libraries/nestjs-libraries/src/chat/mastra.service.ts'),
      'utf8'
    );
    expect(source).toContain('backgroundTasks: {');
    expect(source).toContain('enabled: true');
    expect(source).toContain('onTaskComplete:');
    expect(source).toContain('onTaskFailed:');
    expect(source).toContain('notificationsStore()');
    expect(source).toContain('backgroundTaskManager()');
  });

  test('notification_inbox tool wraps native createNotificationInboxTool with resourceId isolation', async () => {
    const autonomy = loadCapabilityModule('../conductor/conductor.autonomy.ts', {
      mocks: esmStubs,
    });
    const { seedCapabilityContext } = loadCapabilityModule('capability.context.ts');

    expect(autonomy.CONDUCTOR_EXTRA_AUTONOMY_TOOL_NAMES).toContain(
      'notification_inbox'
    );

    const store = new InMemoryNotificationsStorage();
    await store.createNotification({
      id: 'notif-own-1',
      threadId: 'thread-1',
      resourceId: 'org-1:user-1',
      agentId: 'conductor',
      source: 'background-task',
      kind: 'task.completed',
      summary: 'Поручение завершено.',
      priority: 'medium',
    });
    await store.createNotification({
      id: 'notif-other-1',
      threadId: 'thread-1',
      resourceId: 'org-1:user-2',
      agentId: 'conductor',
      source: 'background-task',
      kind: 'task.completed',
      summary: 'Чужое поручение.',
      priority: 'medium',
    });

    const tool = autonomy.buildNotificationInboxTool({
      getNotificationsStore: () => store,
    });

    const ctx = new RequestContext();
    seedCapabilityContext(ctx, IDENTITY);
    ctx.set('mastra__threadId', 'thread-1');

    const listed = await tool.execute(
      { action: 'list' },
      { requestContext: ctx, agent: { threadId: 'thread-1' } }
    );

    expect(listed.notifications).toHaveLength(1);
    expect(listed.notifications[0]).toMatchObject({
      id: 'notif-own-1',
      summary: 'Поручение завершено.',
      status: 'seen',
    });
  });

  test('AgentThreadsService lists, marks read, marks all read, and isolates notifications & background tasks per resourceId', async () => {
    const { AgentThreadsService } = loadCapabilityModule(
      '../conductor/agent-threads.service.ts',
      { mocks: esmStubs }
    );

    const notificationsStore = new InMemoryNotificationsStorage();
    await notificationsStore.createNotification({
      id: 'notif-a-1',
      threadId: 'thread-a-1',
      resourceId: 'org-1:user-1',
      agentId: 'conductor',
      source: 'background-task',
      kind: 'task.completed',
      summary:
        'Исследование готово (ключ sk-proj-1234567890abcdefghijklmnop скрыт).',
      priority: 'medium',
      metadata: { title: 'Поиск фактов' },
    });
    await notificationsStore.createNotification({
      id: 'notif-b-1',
      threadId: 'thread-b-1',
      resourceId: 'org-1:user-2',
      agentId: 'conductor',
      source: 'schedule',
      kind: 'schedule.finished',
      summary: 'Чужое уведомление.',
      priority: 'medium',
      metadata: { title: 'Чужой отчёт' },
    });

    const cancelledTaskIds = [];
    const fakeTaskManager = {
      listTasks: async (filter) => {
        const all = [
          {
            id: 'task-a-1',
            threadId: 'thread-a-1',
            resourceId: 'org-1:user-1',
            toolName: 'research_search',
            status: 'running',
            createdAt: new Date('2026-10-20T12:00:00.000Z'),
            startedAt: new Date('2026-10-20T12:00:01.000Z'),
          },
          {
            id: 'task-b-1',
            threadId: 'thread-b-1',
            resourceId: 'org-1:user-2',
            toolName: 'piece_adapt',
            status: 'running',
            createdAt: new Date('2026-10-20T12:00:00.000Z'),
          },
        ];
        return {
          tasks: all.filter(
            (t) =>
              (!filter?.resourceId || t.resourceId === filter.resourceId) &&
              (!filter?.threadId || t.threadId === filter.threadId)
          ),
          total: 1,
        };
      },
      cancel: async (id) => {
        cancelledTaskIds.push(id);
      },
    };

    const threadsMap = new Map([
      [
        'thread-a-1',
        {
          id: 'thread-a-1',
          resourceId: 'org-1:user-1',
          title: 'Разговор А',
          createdAt: new Date('2026-10-20T11:00:00.000Z'),
          updatedAt: new Date('2026-10-20T12:00:00.000Z'),
          metadata: {},
        },
      ],
      [
        'thread-b-1',
        {
          id: 'thread-b-1',
          resourceId: 'org-1:user-2',
          title: 'Разговор Б',
          createdAt: new Date('2026-10-20T11:00:00.000Z'),
          updatedAt: new Date('2026-10-20T12:00:00.000Z'),
          metadata: {},
        },
      ],
    ]);

    const fakeMemory = {
      getThreadById: async ({ threadId }) => threadsMap.get(threadId) ?? null,
      listThreads: async ({ filter }) => ({
        threads: [...threadsMap.values()].filter(
          (row) => row.resourceId === filter.resourceId
        ),
      }),
      deleteThread: async (threadId) => {
        threadsMap.delete(threadId);
      },
    };

    const fakeMastraService = {
      conductor: async () => ({
        getMemory: async () => fakeMemory,
        listSuspendedRuns: async () => ({ runs: [] }),
      }),
      mastra: async () => ({
        schedules: { list: async () => [], delete: async () => undefined },
      }),
      notificationsStore: async () => notificationsStore,
      backgroundTaskManager: async () => fakeTaskManager,
      toolTitle: (_identity, toolName) =>
        toolName === 'research_search' ? 'Поиск в интернете' : toolName,
    };

    const service = new AgentThreadsService(fakeMastraService);
    const userA = { ...IDENTITY, userId: 'user-1' };
    const userB = { ...IDENTITY, userId: 'user-2' };

    const feedA = await service.listNotifications(userA);
    expect(feedA.notifications).toHaveLength(1);
    expect(feedA.notifications[0]).toMatchObject({
      id: 'notif-a-1',
      threadId: 'thread-a-1',
      title: 'Поиск фактов',
      status: 'pending',
    });
    expect(feedA.notifications[0].message).not.toContain('sk-proj-1234567890');
    expect(feedA.backgroundTasks).toHaveLength(1);
    expect(feedA.backgroundTasks[0]).toMatchObject({
      taskId: 'task-a-1',
      threadId: 'thread-a-1',
      description: 'Поиск в интернете',
      status: 'running',
    });
    expect(feedA.unreadCount).toBe(2); // 1 pending notification + 1 running task

    // User B cannot mark User A's notification read
    await expect(
      service.markNotificationRead(userB, 'notif-a-1')
    ).rejects.toThrow();

    // User A marks all notifications read
    const marked = await service.markAllNotificationsRead(userA);
    expect(marked).toEqual({ ok: true, markedCount: 1 });

    const feedAfter = await service.listNotifications(userA);
    expect(feedAfter.notifications[0].status).toBe('seen');
    expect(feedAfter.unreadCount).toBe(1); // Only the running background task remains

    // Deleting the thread cancels its running background tasks
    await service.remove(userA, 'thread-a-1');
    expect(cancelledTaskIds).toEqual(['task-a-1']);
  });

  test('frontend contract and ThreadSwitcher wire AgentNotificationsBell', () => {
    const contract = loadTypeScriptModule(
      'apps/frontend/src/components/agents/agent.contract.ts'
    );
    const parsed = contract.readAgentNotifications({
      notifications: [
        {
          id: 'n-1',
          threadId: 't-1',
          title: 'Поиск фактов',
          message: 'Готово',
          status: 'pending',
          source: 'background-task',
          createdAt: '2026-10-20T12:00:00.000Z',
        },
      ],
      backgroundTasks: [
        {
          taskId: 'task-1',
          threadId: 't-1',
          description: 'Поиск в интернете',
          status: 'running',
          startedAt: '2026-10-20T12:00:00.000Z',
          completedAt: null,
        },
      ],
      unreadCount: 2,
    });
    expect(parsed.unreadCount).toBe(2);
    expect(parsed.notifications).toHaveLength(1);
    expect(parsed.backgroundTasks).toHaveLength(1);

    const threadsSource = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/agents/agent.threads.tsx'),
      'utf8'
    );
    expect(threadsSource).toContain('AgentNotificationsBell');
    expect(threadsSource).toContain('AGENT_DOORS.notifications');
    expect(threadsSource).toContain('AGENT_DOORS.notificationsReadAll');
  });
});
