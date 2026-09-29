'use strict';

/**
 * Every capability of the agent's registry has a recorded scenario
 * (`content-factory-next-kcxz.11`, spec §8). A task that adds a capability
 * adds its scenario in `tests/fixtures/agent-scenarios/`; one without fails
 * here, before review.
 */

const { loadRegistry } = require('./helpers/agent-capabilities.cjs');
const { coverageGaps, loadScenarios } = require('./helpers/agent-scenarios.cjs');

const registry = loadRegistry();
const capabilityIds = registry.CAPABILITY_CATALOGUE.map((capability) => capability.id);
const scenarios = loadScenarios();

describe('recorded scenario coverage of the capability registry', () => {
  test('the registry is not empty and every scenario names what it covers', () => {
    expect(capabilityIds.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
      // A capability, or a skill whose know-how the scenario proves (the
      // «help» answers, kcxz.24: not a capability, a Mastra skill).
      expect(scenario.covers.length + (scenario.skills ?? []).length).toBeGreaterThan(0);
      expect(typeof scenario.check).toBe('function');
    }
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
  });

  test('every capability has at least one scenario', () => {
    expect(coverageGaps(capabilityIds, scenarios).uncovered).toEqual([]);
  });

  test('a scenario covers only capabilities the registry has, and scripts a call to each', () => {
    const { unknown, unscripted } = coverageGaps(capabilityIds, scenarios);
    expect(unknown).toEqual([]);
    expect(unscripted).toEqual([]);
  });

  test('a scenario that proves a skill names a real one and activates it (kcxz.24)', () => {
    const { CONDUCTOR_SKILL_SPECS } = require('./helpers/agent-capabilities.cjs').loadCapabilityModule(
      '../conductor/conductor.skills.ts'
    );
    const names = new Set(CONDUCTOR_SKILL_SPECS.map((skill) => skill.name));
    const proving = scenarios.filter((scenario) => (scenario.skills ?? []).length);
    expect(proving.map((scenario) => scenario.id)).toContain('help-answer');
    for (const scenario of proving) {
      const activated = scenario.turns.flatMap((turn) =>
        (turn.model || []).flatMap((step) =>
          step.filter(([kind, name]) => kind === 'tool' && name === 'skill').map(([, , input]) => input.name)
        )
      );
      for (const skill of scenario.skills) {
        expect(names.has(skill)).toBe(true);
        expect(activated).toContain(skill);
      }
    }
  });

  test('the guard itself: a capability without a scenario is named', () => {
    expect(
      coverageGaps([...capabilityIds, 'plan.unknown'], scenarios).uncovered
    ).toEqual(['plan.unknown']);
  });
});

/**
 * kcxz.29 D4: the scenario world's fakes must speak the real services' events.
 * The world yielded `piece-questions`, which `IntakeService.run` never does;
 * `piece.create` counted that name, every scenario passed, and the live piece
 * reported «0 questions» for four.
 */
describe('the scenario world speaks the services’ own events', () => {
  test('every event the world yields is one `IntakeService`, `PieceService` or `VoiceService` yields', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    const names = (text) =>
      new Set([...text.matchAll(/yield \{\s*name: '([a-z-]+)'/g)].map((match) => match[1]));
    // `research-ready` is built by a helper the generator yields
    // (`researchReadyEvent`): a returned event literal counts on the service side.
    // So is an event literal typed as the stream's event and yielded later
    // (`persist` builds `adaptation` as `const event: PieceAdaptEventV1`).
    // The avatar analysis queues its AI calls and yields them from the queue
    // (`whileProposing`: `queue.push({ name: 'call', … })`, kcxz.18).
    const built = (text) =>
      new Set(
        [
          ...text.matchAll(/return \{\s*name: '([a-z-]+)'/g),
          ...text.matchAll(/: [A-Za-z]+EventV\d+ = \{\s*name: '([a-z-]+)'/g),
          ...text.matchAll(/queue\.push\(\{\s*name: '([a-z-]+)'/g),
        ].map((match) => match[1])
      );
    // The world's generators: the intake (`IntakeService.run`), the piece's
    // answers (`PieceService.answer`, kcxz.12) and the avatar analysis
    // (`VoiceService.analysisStream`, kcxz.18).
    const sources = [
      read('libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts'),
      read('libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts'),
      read('libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts'),
    ];
    const service = new Set(sources.flatMap((text) => [...names(text), ...built(text)]));
    const world = names(read('tests/fixtures/agent-scenarios/world.cjs'));
    expect(world.size).toBeGreaterThan(0);
    for (const name of world) expect([name, service.has(name)]).toEqual([name, true]);
  });
});
