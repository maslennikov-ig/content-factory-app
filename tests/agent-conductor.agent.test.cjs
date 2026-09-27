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
const { UNTRUSTED_DATA_RULE } = loadCapabilityModule('untrusted-data.ts');

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
  test('three paid calls in one step: one runs, the others read PAID_CAP_REACHED', () => {
    const { runs, outcomes } = report.paidCapOne;
    expect(runs).toBe(1);
    expect(outcomes.filter((outcome) => outcome?.ok === true)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome?.code === 'PAID_CAP_REACHED')).toHaveLength(2);
  });

  test('an explicit continuation allows two, never three', () => {
    const { runs, outcomes } = report.paidCapTwo;
    expect(runs).toBe(2);
    expect(outcomes.filter((outcome) => outcome?.code === 'PAID_CAP_REACHED')).toHaveLength(1);
  });

  test('a model that never stops is asked six times: step 7 never runs', () => {
    expect(report.stepCap.modelCalls).toBe(conductor.CONDUCTOR_MAX_STEPS);
    expect(conductor.CONDUCTOR_MAX_STEPS).toBe(6);
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
        'channels_list',
        'piece_list',
        'piece_open',
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
  });

  test('a question card reaches the browser with its payload and is resumed by runId', () => {
    const { door } = report;
    expect(door.suspendedPayload).toMatchObject({
      avatarId: 'a1',
      canDecideForPerson: false,
      question: expect.stringContaining('Включить'),
    });
    expect(door.resumedTypes).toEqual(expect.arrayContaining(['data-avatar', 'tool-output-available']));
    expect(door.activated).toEqual([{ avatarId: 'a1', consent: true }]);
    expect(door.pendingAtEnd).toBe(0);
    expect(door.errors).toEqual([]);
  });

  test('S1: a suspended run keeps only the whitelisted request context, as primitives', () => {
    const { door } = report;
    expect(door.snapshotCount).toBeGreaterThan(0);
    const ours = door.snapshotContextKeys.filter((key) => key !== 'MastraMemory');
    expect(ours.sort()).toEqual([...conductor.CONDUCTOR_CONTEXT_KEYS].sort());
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
