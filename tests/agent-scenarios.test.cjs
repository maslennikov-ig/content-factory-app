'use strict';

/**
 * Recorded agent scenarios (`content-factory-next-kcxz.11`, spec §8): the real
 * `POST /agent/chat` door driving the real conductor with a scripted model,
 * over an in-memory workspace and the real `AiUsageService` ledger.
 *
 * Each scenario (`tests/fixtures/agent-scenarios/*.scenario.cjs`) asserts the
 * records it wrote, the cards and data parts it emitted and the admissions it
 * opened and closed. Every scenario also passes the checks below. The coverage
 * guard (`agent-scenarios.coverage.guard.test.cjs`) makes sure every
 * capability of the registry has one.
 *
 * The runner is a child process: Mastra and `@mastra/ai-sdk` are ESM-first and
 * the jest runner does not load them (`helpers/agent-scenarios.runner.cjs`).
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadScenarios, toolNameOf } = require('./helpers/agent-scenarios.cjs');

const scenarios = loadScenarios();
let report;

beforeAll(() => {
  // The runner plays every scenario in one child process: ~80 s alone, over
  // 240 s when the machine is busy (the release receipt of 28.09 timed out
  // while another project was building). Generous, because a timeout here is
  // the host's load, not a defect.
  report = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'agent-scenarios.runner.cjs')],
      { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 }
    )
  );
}, 960_000);

describe.each(scenarios.map((scenario) => [scenario.id, scenario]))('scenario %s', (id, scenario) => {
  const run = () => {
    const played = report[id];
    if (!played) throw new Error(`The runner did not play ${id}.`);
    if (played.crashed) throw new Error(`${id} crashed:\n${played.crashed}`);
    return played;
  };

  // A request the scenario plays to be refused at the door (a stale card,
  // review W2 F3): no stream, no admission, nothing for the client to take.
  const refusedAt = new Set(scenario.refusedTurns ?? []);
  const answeredTurns = (played) => played.turns.filter((_turn, index) => !refusedAt.has(index));

  test('every request is answered through the door and ends cleanly', () => {
    const played = run();
    expect(played.turns).toHaveLength(scenario.turns.length);
    for (const index of refusedAt) {
      expect(played.turns[index].refused).not.toBeNull();
      expect(played.turns[index].admissions).toEqual([]);
    }
    for (const turn of answeredTurns(played)) {
      expect(turn.refused).toBeNull();
      expect(turn.errors).toEqual([]);
      expect(turn.ended).toBe(true);
      expect(turn.thread).toBe(played.threadId);
    }
    // Nothing is left waiting unless the scenario ends on a card.
    expect(played.pending).toBe(scenario.endsPending ? 1 : 0);
  });

  test('the browser’s chat core takes every stream the door wrote (kcxz.29)', () => {
    for (const turn of answeredTurns(run())) {
      expect(turn.client).toEqual(expect.objectContaining({ status: 'ready', error: null }));
    }
  });

  test('each request opens exactly one `agent` operation, and every operation is closed', () => {
    const played = run();
    for (const turn of answeredTurns(played)) {
      expect(turn.admissions.filter(([operation]) => operation === 'agent')).toEqual([
        ['agent', 'agent', 'user-1', 'succeeded'],
      ]);
    }
    for (const [, , , status] of played.admissions) expect(status).not.toBe('admitted');
  });

  test('the model called every capability the scenario covers', () => {
    const called = new Set(
      run().turns.flatMap((turn) => turn.toolCalls.map((call) => call.toolName))
    );
    for (const capability of scenario.covers) expect(called).toContain(toolNameOf(capability));
  });

  /**
   * The secrets guard (kcxz.20, spec §1.5, §4.10, A4): no key shape of
   * `secret-shapes.ts` in anything the model read, anything Mastra stored
   * (messages, working memory, run snapshots, traces, log records), the
   * stream the browser got, the thread a reload reads, what the services
   * were asked, or what the process logged — in every recorded scenario,
   * including the one that pastes keys into the chat (`ai-key-pasted`).
   */
  test('no key shape in the model’s input, storage, the stream, the history, service requests or the log', () => {
    const played = run();
    const { sent, ...after } = played.secrets;
    expect(after).toEqual({ model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
    // A conversation was stored (a request refused at the door stores none).
    if (played.storedPartTypes.length) expect(played.storedMessages).toBe(true);
    if (sent.length) expect(played.storedKeyMarker).toBe(true);
  });

  /**
   * The same guard, independent of the detector (review W3-20 F5): the exact
   * keys the scenario sent (`pastedKeys`) left the client and are found
   * nowhere after the door — not in the model's input, the storage, the
   * stream, the history, the service requests, the log, or the workspace's
   * rows. A key the shapes miss would slip past the guard above; not this one.
   */
  test('no key the scenario sent, literally, anywhere after the door', () => {
    const played = run();
    const { sent, ...after } = played.literal;
    expect(sent).toEqual((scenario.pastedKeys ?? []).map((_key, index) => index));
    expect(after).toEqual({ model: [], stored: [], stream: [], history: [], requests: [], logs: [], world: [] });
  });

  test(scenario.title, () => scenario.check(run()));
});

/**
 * kcxz.29 D5: the live approval card and the reloaded one say the same, and
 * no «Готово» of Mastra's own housekeeping sits above a card still waiting.
 * The live side is what the browser's chat core built from the door's stream
 * (`client`), read by the screen's own contract.
 */
describe('kcxz.29 D5 — one approval card, live and reloaded', () => {
  const contract = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
    'apps/frontend/src/components/agents/agent.contract.ts'
  );
  const blocksOf = (messages, pending = []) =>
    messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => contract.readMessageBlocks(message, pending));

  test('the live card carries the label the reloaded card has, and nothing «done» precedes it', () => {
    const played = report['piece-delete-pending'];
    const live = blocksOf(played.turns[0].client.messages);
    const reloaded = contract.readThreadHistory(played.history);
    const again = blocksOf(reloaded.messages, reloaded.pending);

    const liveCard = live.find((block) => block.type === 'approval');
    const reloadedCard = again.find((block) => block.type === 'approval');
    expect(liveCard).toEqual(
      expect.objectContaining({ title: 'Удалить заготовку', state: 'asked' })
    );
    expect(reloadedCard).toEqual(expect.objectContaining({ title: liveCard.title }));
    expect(live.filter((block) => block.type === 'done')).toEqual([]);
  });
});
