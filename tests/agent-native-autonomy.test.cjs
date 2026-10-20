'use strict';

/**
 * Acceptance tests for `content-factory-next-on0i.4` (`A5`, `A8`, `A18`, `A19`, `A20`):
 * Native Autonomy, Planning, Questions, Goals, Subagents, and Follow-Up Schedules.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const questionCard = loadCapabilityModule('question-card.ts');

const runAutonomyProbe = () => {
  const probePath = path.join(
    __dirname,
    'helpers',
    'agent-native-autonomy.probe.cjs'
  );
  const raw = execFileSync(process.execPath, [probePath], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return JSON.parse(raw);
};

describe('Native Autonomy, Planning, Questions, Goals, Subagents, and Follow-Up Schedules (on0i.4)', () => {
  let probe;

  beforeAll(() => {
    probe = runAutonomyProbe();
  });

  test('A5 & A18: native ask_user and submit_plan suspend with bound cardId and resume cleanly', () => {
    const { askAndPlan } = probe;
    expect(askAndPlan.askToolName).toBe('ask_user');
    expect(askAndPlan.askCardView).toMatchObject({
      question: 'Для какой аудитории пишем этот разбор?',
      options: [
        { label: 'Разработчики', description: 'Технический уклон' },
        { label: 'Руководители', description: 'Бизнес-выводы' },
      ],
    });
    expect(typeof askAndPlan.askCardView.cardId).toBe('string');
    expect(askAndPlan.askCardView.cardId.length).toBeGreaterThan(8);
    expect(askAndPlan.normalizedAskResumeData).toBe('Разработчики');

    expect(askAndPlan.planToolName).toBe('submit_plan');
    expect(askAndPlan.planCardView).toMatchObject({
      title: 'План подготовки материала',
      plan: '1. Собрать фактуру\n2. Написать черновик\n3. Проверить клише',
    });
    expect(typeof askAndPlan.planCardView.cardId).toBe('string');
    expect(askAndPlan.normalizedPlanResumeData).toEqual({
      action: 'approved',
      feedback: 'Отличный план',
    });
    expect(askAndPlan.thirdText).toContain('План согласован');
    expect(askAndPlan.modelCalls).toBe(3);

    // Direct unit checks for questionCard compatibility across ask_user, submit_plan, and legacy question cards
    expect(
      questionCard.answerFitsCard(askAndPlan.askCardView, {
        answer: 'Разработчики',
        decideForPerson: false,
      })
    ).toBe(true);
    expect(
      questionCard.answerFitsCard(askAndPlan.askCardView, {
        answer: ['Разработчики', 'Маркетологи'],
      })
    ).toBe(true);
    expect(
      questionCard.normalizeAskUserAnswer({
        answer: '',
        decideForPerson: true,
      })
    ).toBe('Решите за меня');
    expect(
      questionCard.answerFitsCard(askAndPlan.planCardView, {
        action: 'rejected',
        feedback: 'Добавь раздел с цифрами',
      })
    ).toBe(true);
    expect(
      questionCard.answerFitsCard(askAndPlan.planCardView, {
        action: 'unknown',
      })
    ).toBe(false);
  });

  test('A18: native task_write, task_update, task_check, task_complete and single TaskStateProcessor snapshot', () => {
    const { tasks } = probe;
    expect(tasks.text).toContain('Все задачи выполнены');
    expect(tasks.toolResults).toHaveLength(5);
    expect(tasks.toolResults[0]).toMatchObject({
      isError: false,
      tasks: [
        expect.objectContaining({
          id: 't-1',
          content: 'Собрать источники по теме',
          status: 'in_progress',
        }),
        expect.objectContaining({
          id: 't-2',
          content: 'Подготовить заготовку',
          status: 'pending',
        }),
      ],
    });
    expect(tasks.toolResults[3]).toMatchObject({
      isError: false,
      summary: {
        total: 2,
        completed: 1,
        inProgress: 1,
        pending: 0,
        incomplete: 1,
        hasTasks: true,
        allCompleted: false,
      },
    });
    expect(tasks.toolResults[4]).toMatchObject({
      isError: false,
      tasks: [
        expect.objectContaining({ id: 't-1', status: 'completed' }),
        expect.objectContaining({ id: 't-2', status: 'completed' }),
      ],
    });
    expect(tasks.secondStepHasTaskState).toBe(true);
    // TaskStateProcessor adds 1 system guidance mention and 1 state signal snapshot (<current-task-list count="2">)
    expect(tasks.taskReminderOccurrences).toBeLessThanOrEqual(2);
  });

  test('A18: set_objective and native goal judge reject prose-only completion until workspace artifact exists, and hide internal threads', () => {
    const { goal } = probe;
    expect(goal.createdPiecesCount).toBe(1);
    expect(goal.judgeEvalCount).toBe(2);
    expect(goal.mainModelCalls).toBe(4);
    expect(goal.finalText).toContain('Заготовка «Итоги релиза» создана');
    expect(goal.judgeToolsOffered).toEqual(
      expect.arrayContaining([
        'workspace_snapshot',
        'channels_list',
        'piece_list',
        'piece_open',
        'piece_read',
        'plan_ahead',
        'plan_calendar',
        'plan_ready',
      ])
    );
    expect(goal.storedObjective).toMatchObject({
      objective: 'Создать заготовку с темой «Итоги релиза»',
      text: 'Создать заготовку с темой «Итоги релиза»',
      status: 'done',
      runsUsed: 2,
      maxRuns: 3,
    });
    // Both goalJudge: true and forkedSubagent: true threads are excluded from visible threads
    expect(goal.rawThreadCount).toBe(3);
    expect(goal.visibleThreadIds).toEqual(['thread-autonomy-goal']);
  });

  test('A18: bounded subagent delegation routes to metered roles, exposes zero confirm/secret tools, and refuses forked: true', () => {
    const { subagents } = probe;
    expect(subagents.subagentRolesCalled).toEqual([
      { agentType: 'research', billingRole: 'research' },
      { agentType: 'writing', billingRole: 'draft' },
      { agentType: 'review', billingRole: 'review' },
    ]);
    expect(subagents.createdPiecesByWritingSubagent).toBe(1);
    expect(subagents.toolResults).toHaveLength(4);
    expect(subagents.toolResults[0]).toMatchObject({
      ok: true,
      agentType: 'research',
      isError: false,
    });
    expect(subagents.toolResults[1]).toMatchObject({
      ok: true,
      agentType: 'writing',
      isError: false,
    });
    expect(subagents.toolResults[2]).toMatchObject({
      ok: true,
      agentType: 'review',
      isError: false,
    });
    expect(subagents.toolResults[3]).toMatchObject({
      ok: false,
      code: 'PERMISSION_DENIED',
    });

    // Subagent toolsets never include confirm or secret capabilities
    const forbiddenTools = [
      'piece_delete',
      'publication_publish',
      'schedule_at',
      'schedule_reschedule',
      'schedule_cancel',
      'channel_connect',
      'channel_disconnect',
      'settings_ai_save',
    ];
    for (const toolSet of [
      subagents.researchToolsOffered,
      subagents.writingToolsOffered,
      subagents.reviewToolsOffered,
    ]) {
      for (const forbidden of forbiddenTools) {
        expect(toolSet).not.toContain(forbidden);
      }
    }
    expect(subagents.researchToolsOffered).not.toContain('piece_create');
    expect(subagents.writingToolsOffered).toContain('piece_create');
    expect(subagents.reviewToolsOffered).toContain('text_slop_check');
  });

  test('A8: ToolSearchProcessor filters discovered tools by caller role', () => {
    const { toolSearch } = probe;
    expect(toolSearch.editorHasSearchTools).toBe(true);
    expect(toolSearch.editorSearchNames).toContain('piece_create');
    expect(toolSearch.userSearchNames).not.toContain('piece_create');
    expect(toolSearch.userSearchNames).not.toContain('piece_create_from-research');
    expect(toolSearch.userSearchNames).toContain('piece_read');
  });

  test('A19 & A20: recurring follow-up schedules default to Europe/Moscow when timezone is unset, cancel cleanly, and skip deleted threads', () => {
    const { schedules } = probe;
    expect(schedules.createdSchedule).toMatchObject({
      title: 'Еженедельный дайджест идей',
      prompt: 'Подбери 3 свежие идеи по ключевым темам недели',
      cron: '0 9 * * 1',
      timeZone: 'Europe/Moscow',
      timezoneAssumed: true,
      threadId: 'thread-autonomy-schedules',
      enabled: true,
    });
    expect(schedules.createdSchedule.timezoneNote).toContain('Europe/Moscow');
    expect(schedules.listedBeforeCancelCount).toBe(1);
    expect(schedules.cancelResult).toMatchObject({
      ok: true,
      cancelled: true,
      scheduleId: schedules.createdSchedule.id,
    });
    expect(schedules.listedAfterCancelCount).toBe(0);
    expect(schedules.secondSchedule).toMatchObject({
      title: 'Пятничный обзор',
      timeZone: 'Europe/Kaliningrad',
      timezoneAssumed: false,
    });
    expect(schedules.preparedWhileThreadAlive).toBe(true);
    expect(schedules.preparedAfterThreadDeleted).toBeNull();
  });

  test('A18–A20: AgentThreadsService filters internal threads, manages objectives/schedules, and deletes thread schedules on remove()', () => {
    const { threadsService } = probe;
    expect(threadsService.listedThreadIds).toEqual(['t-user']);
    expect(threadsService.judgeHistoryRejected).toBe(true);
    expect(threadsService.forkHistoryRejected).toBe(true);

    expect(threadsService.setObjective).toMatchObject({
      objective: 'Подготовить серию из 3 постов',
      text: 'Подготовить серию из 3 постов',
      status: 'active',
      maxRuns: 4,
    });
    expect(threadsService.getObjective).toMatchObject({
      text: 'Подготовить серию из 3 постов',
      maxRuns: 4,
    });
    expect(threadsService.clearObjective).toEqual({
      objective: null,
      cleared: true,
    });
    expect(threadsService.getAfterClearObjective).toBeNull();

    expect(threadsService.createdSchedule).toMatchObject({
      id: 'sched-1',
      title: 'Утренний обзор',
      timeZone: 'Europe/Moscow',
      timezoneAssumed: true,
      threadId: 't-user',
    });
    expect(threadsService.schedulesBeforeRemoveCount).toBe(1);
    expect(threadsService.schedulesAfterRemoveCount).toBe(0);
  });
});
