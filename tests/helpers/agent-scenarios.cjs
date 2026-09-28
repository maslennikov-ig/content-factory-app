'use strict';

/**
 * Recorded agent scenarios (`content-factory-next-kcxz.11`, spec §8): where
 * they live, how they are read, and which capability each one proves.
 *
 * A scenario is one file `tests/fixtures/agent-scenarios/*.scenario.cjs`:
 *
 * - `id`, `title`;
 * - `covers`: the capability ids it drives end to end (the coverage guard
 *   reads this, and the scenario suite checks the model really called each);
 * - `role` (default `EDITOR`) and `world` (overrides of the base rows);
 * - `turns`: requests to `POST /agent/chat`, in order — `{ say }` a message
 *   (with `samples`: the receipt of files the composer uploaded, kcxz.18),
 *   `{ approve: true | false }` an answer on the last approval card (or, with
 *   `approveCardOfTurn: n`, on the card of turn n further up), sent the way
 *   the screen sends it,
 *   `{ resume: {...} }` an answer on the last question card — each with the
 *   `model` steps the scripted model plays for that request (a step is a list
 *   of `['tool', name, input]` / `['text', words]`);
 * - `check(run)`: jest assertions over what the runner recorded.
 *
 * The runner (`agent-scenarios.runner.cjs`) plays them in a child process.
 */

const fs = require('node:fs');
const path = require('node:path');

const SCENARIO_DIR = path.resolve(__dirname, '..', 'fixtures', 'agent-scenarios');
const SUFFIX = '.scenario.cjs';

const loadScenarios = () =>
  fs
    .readdirSync(SCENARIO_DIR)
    .filter((name) => name.endsWith(SUFFIX))
    .sort()
    .map((name) => ({ file: name, ...require(path.join(SCENARIO_DIR, name)) }));

/** `piece.delete` → `piece_delete`, as the registry names tools. */
const toolNameOf = (id) => id.replace(/\./g, '_');

/** Tool names a scenario's scripted model calls, over all its turns. */
const scriptedTools = (scenario) =>
  new Set(
    scenario.turns.flatMap((turn) =>
      (turn.model || []).flatMap((step) =>
        step.filter(([kind]) => kind === 'tool').map(([, name]) => name)
      )
    )
  );

/**
 * What the coverage guard refuses: a capability no scenario covers, a
 * scenario that claims a capability the registry does not have, and a claim
 * the scenario's own script never calls.
 */
const coverageGaps = (capabilityIds, scenarios) => {
  const known = new Set(capabilityIds);
  const covered = new Set(scenarios.flatMap((scenario) => scenario.covers || []));
  return {
    uncovered: capabilityIds.filter((id) => !covered.has(id)),
    unknown: scenarios.flatMap((scenario) =>
      (scenario.covers || [])
        .filter((id) => !known.has(id))
        .map((id) => `${scenario.id}: ${id}`)
    ),
    unscripted: scenarios.flatMap((scenario) => {
      const called = scriptedTools(scenario);
      return (scenario.covers || [])
        .filter((id) => !called.has(toolNameOf(id)))
        .map((id) => `${scenario.id}: ${id}`);
    }),
  };
};

/**
 * What the «Новый материал» screen sends to `POST /content-intelligence/intake`
 * for the same words and choices — its own `buildIntakePayload`, loaded from
 * the frontend, so «the records match the screen path» (`kcxz.12`) is read
 * against the screen's code, not a copy of it.
 */
const screenIntakeBody = (input) =>
  require('./load-tsx.cjs')
    .loadTypeScriptModule('apps/frontend/src/components/content-intelligence/intake/intake.adapter.ts')
    .buildIntakePayload(input);

/**
 * The piece page's own request builders (`pieces.adapter.ts`:
 * `buildAdaptPayload`, `adaptOverrides`, `buildAdaptationPatch`,
 * `rememberedProfilePayload`), loaded from the frontend (`kcxz.14`).
 */
const screenPieces = () =>
  require('./load-tsx.cjs').loadTypeScriptModule(
    'apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts'
  );

module.exports = {
  screenPieces,
  SCENARIO_DIR,
  loadScenarios,
  coverageGaps,
  toolNameOf,
  scriptedTools,
  screenIntakeBody,
};
