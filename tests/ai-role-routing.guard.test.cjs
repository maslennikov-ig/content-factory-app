'use strict';

/**
 * `content-factory-next-x63z`: nothing above the chooser names a model.
 *
 * The bead's acceptance is a shape, not a number: «ни одна роль не зашита в
 * коде вызова как имя модели». A call that reads `config.textModel` itself has
 * decided which model it wants, and no setting on the settings screen can move
 * it afterwards — which is exactly how the product ended up sending a
 * one-sentence classification to the model that writes drafts.
 *
 * So the two trees that hold the AI calls are read as text, and only three
 * files may name a stored model id: the one that chooses (`ai.roles.ts`), the
 * one that loads the setting (`ai.provider.config.ts`), and the one that shows
 * it back on the settings screen (`ai.provider.service.ts`). Everything else
 * asks for a role.
 *
 * The rest holds the vocabulary together: one declaration of the role list,
 * a human name for every role in the two locales a person writes, and a
 * settings door that accepts the map.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const SCANNED = [
  'libraries/nestjs-libraries/src/openai',
  'libraries/nestjs-libraries/src/content-intelligence',
];

/**
 * Three files, each for a stated reason. This list may shrink and must not
 * grow without one.
 */
const MAY_NAME_A_MODEL = new Map([
  [
    'libraries/nestjs-libraries/src/openai/ai.roles.ts',
    'The chooser itself: this is the only place a role turns into a model id.',
  ],
  [
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    'Loads the stored setting into the resolved configuration.',
  ],
  [
    'libraries/nestjs-libraries/src/openai/ai.provider.service.ts',
    'The settings screen reads its own saved values back.',
  ],
]);

const typeScriptFiles = (directory) => {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const child = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return typeScriptFiles(child);
      return entry.name.endsWith('.ts') ? [child] : [];
    });
};

/** Comments describe the rule; only code may not name the model. */
const withoutComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

test('no AI call site reads a stored model id for itself', () => {
  const offenders = [];
  for (const directory of SCANNED) {
    for (const relative of typeScriptFiles(directory)) {
      if (MAY_NAME_A_MODEL.has(relative)) continue;
      const code = withoutComments(read(relative));
      const found = code.match(/\.(textModel|imageModel)\b/g);
      if (found) offenders.push(`${relative}: ${[...new Set(found)].join(', ')}`);
    }
  }

  expect(offenders).toEqual([]);
});

test('the files allowed to name a model still exist and still do', () => {
  for (const [relative] of MAY_NAME_A_MODEL) {
    expect(fs.existsSync(path.join(root, relative))).toBe(true);
  }
});

test('the role list is declared once', () => {
  const declarations = [];
  for (const directory of SCANNED) {
    for (const relative of typeScriptFiles(directory)) {
      if (/export const AI_ROLES\b/.test(read(relative))) {
        declarations.push(relative);
      }
    }
  }

  expect(declarations).toEqual([
    'libraries/nestjs-libraries/src/openai/ai.roles.ts',
  ]);
});

test('the shared chooser is the only modelFor in the AI code', () => {
  const definitions = [];
  for (const directory of SCANNED) {
    for (const relative of typeScriptFiles(directory)) {
      if (/(const|function)\s+modelFor\b/.test(withoutComments(read(relative)))) {
        definitions.push(relative);
      }
    }
  }

  expect(definitions).toEqual([
    'libraries/nestjs-libraries/src/openai/ai.roles.ts',
  ]);
});

/**
 * The settings screen cannot import a backend module, so it declares the list
 * again. Two lists that drift give the worst outcome available: a row a person
 * fills in that no call ever reads, or a routed role with no way to set it.
 */
test('the settings screen offers exactly the roles the server routes', () => {
  const { AI_ROLES } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.roles.ts'
  );
  const screen = read(
    'apps/frontend/src/components/settings/ai-provider.component.tsx'
  );
  const declared = /const AI_ROLES = \[([\s\S]*?)\] as const;/.exec(screen);

  expect(declared).not.toBeNull();
  expect([...declared[1].matchAll(/'([a-z_]+)'/g)].map(([, role]) => role)).toEqual(
    [...AI_ROLES]
  );
});

test('every role has a human name in the two locales a person writes', () => {
  const { AI_ROLES } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.roles.ts'
  );

  for (const locale of ['en', 'ru']) {
    const translation = JSON.parse(
      read(
        `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
      )
    );
    for (const role of AI_ROLES) {
      expect({ locale, role, value: translation[`ai_role_${role}`] }).toEqual({
        locale,
        role,
        value: expect.stringMatching(/\S/),
      });
    }
  }
});

test('the settings DTO accepts a role map and refuses a bad model id', async () => {
  const { AiProviderDto } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts'
  );
  const { validate } = require('class-validator');

  const valid = Object.assign(new AiProviderDto(), {
    provider: 'openai',
    roleModels: { classify: 'cheap-classifier' },
  });
  expect(await validate(valid)).toEqual([]);

  for (const roleModels of [
    { classify: ' padded ' },
    { classify: 'm'.repeat(101) },
    { classify: 42 },
    { not_a_role: 'anything' },
    'classify=cheap',
  ]) {
    expect(await validate(
      Object.assign(new AiProviderDto(), { provider: 'openai', roleModels })
    )).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'roleModels' }),
      ])
    );
  }
});

/**
 * `main.ts` runs the global pipe with `whitelist: true`, which deletes every
 * property the DTO does not declare with a validation decorator. A field added
 * with `@IsOptional()` alone survives type-checking and is then silently
 * dropped off the request, so the screen saves and nothing changes — a failure
 * with no error anywhere. Proved rather than assumed.
 */
test('the whitelisting pipe keeps the role map and still drops what is not declared', async () => {
  const { AiProviderDto } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts'
  );
  const { validate } = require('class-validator');

  const dto = Object.assign(new AiProviderDto(), {
    provider: 'openai',
    roleModels: { classify: 'cheap-classifier' },
    somethingNobodyDeclared: 'dropped',
  });

  expect(await validate(dto, { whitelist: true })).toEqual([]);
  expect(dto.roleModels).toEqual({ classify: 'cheap-classifier' });
  expect(dto.somethingNobodyDeclared).toBeUndefined();
});

test('the ledger carries the role beside the operation', () => {
  const schema = read(
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
  );
  const record = /model AiUsageRecord \{([\s\S]*?)^\}/m.exec(schema);
  expect(record).not.toBeNull();
  expect(record[1]).toMatch(/^\s+role\s+String\?/m);

  const setting = /model AiProviderSetting \{([\s\S]*?)^\}/m.exec(schema);
  expect(setting).not.toBeNull();
  expect(setting[1]).toMatch(/^\s+roleModels\s+Json\?/m);
});
