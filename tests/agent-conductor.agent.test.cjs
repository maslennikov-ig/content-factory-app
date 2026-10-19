'use strict';

/**
 * The conductor inside real Mastra (`content-factory-next-kcxz.7`) and the
 * `/agent/chat` turn pipeline (`kcxz.8`), end to end with a scripted model:
 * `Agent` + `Mastra` + `InMemoryStore` + `Memory` + `handleChatStream` v7.
 *
 * Premortem rows proven here: A2 (paid cap in one step, step cap), S1 (what a
 * suspended run's snapshot keeps of the request context), S3 (an approval
 * runs the stored call, not the client's copy), and the secrets guard (no key
 * shape reaches the model, the messages, working memory or a snapshot).
 *
 * The probe runs in a child process: these packages are ESM-first and the
 * jest runner does not load them (`helpers/agent-conductor.probe.cjs`).
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const conductor = loadCapabilityModule('../conductor/conductor.context.ts');
const { LAST_STEP_NOTE } = loadCapabilityModule('../conductor/conductor.steps.ts');
const { UNTRUSTED_DATA_RULE } = loadCapabilityModule('untrusted-data.ts');
const { APPROVED_ON_CARD } = loadCapabilityModule('../conductor/agent-chat.request.ts');

let report;

beforeAll(() => {
  report = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'agent-conductor.probe.cjs')],
      { encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024 }
    )
  );
}, 120_000);

describe('limits of one turn (premortem A2, ADR-0012 §7)', () => {
  test('all requested paid operations run sequentially with the native concurrency limit', () => {
    for (const result of [report.paidCapOne, report.paidCapTwo]) {
      expect(result.runs).toBe(3);
      expect(result.outcomes.every((outcome) => outcome?.ok === true)).toBe(true);
    }
  });

  test('the emergency step fuse is larger than the former routine cap and leaves tools available', () => {
    expect(report.stepCap.modelCalls).toBe(3);
    expect(report.stepCap.budget.stopCode).toBe('AGENT_TASK_NO_PROGRESS');
    expect(conductor.CONDUCTOR_MAX_STEPS).toBe(64);
    expect(report.stepCap.toolChoices).not.toContain('none');
    expect(report.stepCap.lastSystem).not.toContain(LAST_STEP_NOTE);
    expect(report.stepCap.lastSystem).toContain('You are the assistant inside Content Factory');
  });

  test('the workspace is read once per turn, however many steps it takes', () => {
    expect(report.stepCap.snapshotReads).toBe(1);
  });
});

describe('what the model is offered', () => {
  test('an editor gets the registry tools and the skill tools', () => {
    expect(report.editorTurn.tools).toEqual(
      expect.arrayContaining([
        'workspace_snapshot',
        'channels_list',
        'piece_rename',
        'piece_create',
        'piece_delete',
        'avatar_activate',
        'skill',
        'skill_read',
        'skill_search',
      ])
    );
  });

  test('a USER is not shown write tools only to be refused by them (spec §4.2)', () => {
    expect([...report.userTurn.tools].sort()).toEqual(
      [
        // Avatars are read by every member (kcxz.18); nothing that changes one.
        'avatar_learning',
        'avatar_list',
        'avatar_manual',
        'avatar_overview',
        'avatar_passport',
        'avatar_proposal',
        'avatar_samples',
        // A channel and its posts are read by every member (kcxz.19).
        'channel_open',
        'channel_posts',
        'channels_list',
        // Subscriptions and leads are read by every member (kcxz.23).
        'ideas_list',
        'ideas_queue',
        // Facts, own texts on a topic and analytics are read by every
        // member (kcxz.24); the cliché check is an editor's.
        'facts_list',
        'texts_related',
        'analytics_production',
        'analytics_channel',
        // The media library is read by every member (kcxz.25).
        'media_library',
        'piece_list',
        'piece_open',
        'piece_read',
        'plan_ahead',
        'plan_calendar',
        'plan_ready',
        'skill',
        'skill_read',
        'skill_search',
        'workspace_snapshot',
      ].sort()
    );
  });

  test('the instruction speaks as the product and carries the snapshot as data', () => {
    const { system } = report.editorTurn;
    expect(system).toContain('«мы»');
    expect(system).toContain('«ИИ»');
    expect(system).toContain('«Решите за меня»');
    expect(system).toContain('say in one line that it is done');
    // The snapshot is inside the data wrapper, the stranger's words with it.
    const line = system
      .split('\n')
      .find((candidate) => candidate.startsWith('{"untrustedData"'));
    const wrapped = JSON.parse(line).untrustedData;
    expect(wrapped.rule).toBe(UNTRUSTED_DATA_RULE);
    expect(JSON.stringify(wrapped.value)).toContain(report.injection);
    expect(wrapped.value.pieces[0]).toMatchObject({ id: 'p1', code: 'cnt-1' });
    // Group know-how is disclosed as skills, not inlined.
    expect(system).toContain('workspace-start');
    expect(system).toContain('avatars');
  });
});

describe('the /agent/chat pipeline with a scripted model', () => {
  test('a delete shows an approval card with the stored arguments and waits', () => {
    const { door } = report;
    expect(door.firstTypes).toEqual(
      expect.arrayContaining(['tool-approval-request', 'data-tool-call-approval'])
    );
    expect(door.firstTypes).not.toContain('finish');
    expect(door.pendingArgs).toEqual([{ pieceId: 'p1' }]);
  });

  test('S3: an approval whose client copy was tampered with runs the stored call once', () => {
    const { door } = report;
    expect(door.deleted).toEqual(['p1']);
    expect(door.approvalOutput).toMatchObject({ ok: true, summary: { pieceId: 'p1', deleted: true } });
    expect(door.approvalTypes).toContain('finish');
    // Real Mastra receives the current-request note beside the completed
    // stored tool result. Scripted prose is not proof of provider semantics.
    expect(door.approvalModelSystem).toContain(APPROVED_ON_CARD);
    expect(JSON.parse(door.approvalModelPrompt)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool-result',
            output: expect.objectContaining({
              type: 'json',
              value: expect.objectContaining({ ok: true, summary: { pieceId: 'p1', deleted: true } }),
            }),
          }),
        ]),
      }),
    ]));
    expect(door.laterModelSystems.every((system) => !system.includes(APPROVED_ON_CARD))).toBe(true);
  });

  test('a question card reaches the browser with its payload and is resumed by runId', () => {
    const { door } = report;
    expect(door.suspendedPayload).toMatchObject({
      avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1',
      canDecideForPerson: false,
      question: expect.stringContaining('Включить'),
    });
    expect(door.resumedTypes).toEqual(expect.arrayContaining(['data-avatar', 'tool-output-available']));
    expect(door.activated).toEqual([{ avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1', consent: true }]);
    expect(door.pendingAtEnd).toBe(0);
    expect(door.errors).toEqual([]);
  });

  test('S1: a suspended run keeps only the whitelisted request context, as primitives', () => {
    const { door } = report;
    expect(door.snapshotCount).toBeGreaterThan(0);
    const ours = door.snapshotContextKeys.filter((key) => key !== 'MastraMemory');
    // This native pipeline probe bypasses the HTTP controller and its tracked
    // execution scope. The managed request's complete whitelist is covered by
    // agent-conductor.unit; this legacy path must not claim an execution id.
    expect(ours).not.toContain(conductor.CONDUCTOR_EXECUTION_ID_KEY);
    for (const key of ours) expect(conductor.CONDUCTOR_CONTEXT_KEYS).toContain(key);
    expect(door.snapshotContextValueTypes).toEqual(
      expect.arrayContaining(['string'])
    );
    for (const type of door.snapshotContextValueTypes) {
      expect(['string', 'number']).toContain(type);
    }
    // Mastra's own key holds the thread row and its memory settings, never an
    // organization row or a user row.
    expect(door.snapshotMastraMemoryKeys).toEqual(
      expect.arrayContaining(['resourceId', 'thread'])
    );
    for (const key of door.snapshotMastraMemoryKeys) {
      expect(['resourceId', 'thread', 'memoryConfig', 'runState']).toContain(key);
    }
  });

  test('secrets guard: a pasted key reaches neither the model nor storage', () => {
    const { door } = report;
    expect(door.modelSawKey).toBe(false);
    expect(door.storedKey).toBe(false);
    // Every key shape of `conductor.secrets.ts`, over messages, working
    // memory, the suspended run's snapshot and the pending list.
    expect(door.secretShapeCount).toBeGreaterThanOrEqual(6);
    expect(door.secretShapeHits).toEqual([]);
    expect(door.storedText).toContain('[KEY]');
  });
});
