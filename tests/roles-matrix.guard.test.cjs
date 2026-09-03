'use strict';

/**
 * `docs/product/roles-matrix.md` says who may open what. This keeps it true.
 *
 * Written last on purpose (`content-factory-next-saas.2.1`): a guard put in
 * front of behaviour the owner has not confirmed pins the mistake along with
 * the behaviour. The first edition of that document was wrong twice, both
 * times because the reading of it was a search through source text that lost
 * the second policy on a door. So the doors here come out of the TypeScript
 * parser, not a regular expression: a decorator is read as a decorator, and
 * every policy on a handler is seen, not just the first.
 *
 * Three things are held together:
 *
 *  - the table of doors, by path and by count, against the controllers;
 *  - the guard's unauthenticated exemption, against the list the document
 *    prints — this is the one that was silently wrong for months;
 *  - the roles themselves: the schema, the assignable list, the ranking, and
 *    the team screen that offers them.
 *
 * The count in each row is deliberate churn. Adding a door to an area that
 * already has a row would otherwise pass unread, and «how many doors are
 * administrators-only» is exactly the kind of claim a matrix is for.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const ROUTE_ROOTS = [
  'apps/backend/src/api/routes',
  'apps/backend/src/public-api/routes',
];
const MATRIX = 'docs/product/roles-matrix.md';
const GUARD = 'apps/backend/src/services/auth/permissions/permissions.guard.ts';
const ROLES = 'libraries/nestjs-libraries/src/user/organization.roles.ts';
const SCHEMA = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const TEAM_SCREEN = 'apps/frontend/src/components/settings/teams.component.tsx';
const SETTINGS_SCREEN = 'apps/frontend/src/components/layout/settings.component.tsx';
const GLOBAL_SETTINGS = 'apps/frontend/src/components/settings/global.settings.tsx';

const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch']);

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

const literalOf = (node) =>
  node && ts.isStringLiteralLike(node) ? node.text : '';

/** Every route handler that carries `@CheckPolicies`, with its sections. */
const doorsWithPolicies = () => {
  const doors = [];

  for (const relative of ROUTE_ROOTS.flatMap(typeScriptFiles)) {
    const source = ts.createSourceFile(
      relative,
      read(relative),
      ts.ScriptTarget.Latest,
      true
    );

    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;

      let prefix = null;
      for (const decorator of ts.getDecorators(node) || []) {
        const call = decorator.expression;
        if (
          ts.isCallExpression(call) &&
          call.expression.getText() === 'Controller'
        ) {
          prefix = literalOf(call.arguments[0]);
        }
      }
      if (prefix === null) return;

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;

        let method;
        let route = '';
        let sections;
        for (const decorator of ts.getDecorators(member) || []) {
          const call = decorator.expression;
          if (!ts.isCallExpression(call)) continue;
          const name = call.expression.getText();
          if (HTTP_METHODS.has(name)) {
            method = name.toUpperCase();
            route = literalOf(call.arguments[0]);
          }
          if (name === 'CheckPolicies') {
            sections = call.arguments
              .map((argument) => argument.getText().match(/Sections\.(\w+)/))
              .filter(Boolean)
              .map((match) => match[1]);
          }
        }

        if (!method || !sections?.length) continue;
        doors.push({
          method,
          path: `${prefix}${route}`.replace(/\/$/, '') || '/',
          sections,
          file: relative,
        });
      }
    });
  }

  return doors.sort((left, right) =>
    `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`)
  );
};

/** The rows of the «Двери» table, in document order. */
const matrixRows = () => {
  const document = read(MATRIX);
  const table = document
    .split('\n## ')
    .find((section) => section.startsWith('Двери'));
  if (!table) throw new Error('The matrix has no «Двери» section');

  return table
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        path: cells[0].replace(/`/g, ''),
        sections: cells[1]
          .split(',')
          .map((section) => section.trim())
          .filter(Boolean),
        count: Number(cells[2]),
        audience: cells[3],
      };
    });
};

const covers = (rowPath, doorPath) =>
  doorPath === rowPath || doorPath.startsWith(`${rowPath}/`);

/** The row that owns a door: the longest path that covers it. */
const rowFor = (rows, door) =>
  rows
    .filter((row) => covers(row.path, door.path))
    .sort((left, right) => right.path.length - left.path.length)[0];

describe('the roles matrix describes the doors that exist', () => {
  const doors = doorsWithPolicies();
  const rows = matrixRows();

  test('every door with a policy is named by a row', () => {
    const orphans = doors
      .filter((door) => !rowFor(rows, door))
      .map((door) => `${door.method} ${door.path} (${door.file})`);

    expect({
      orphans,
      fix: `add a row to ${MATRIX} for each door listed above`,
    }).toEqual({ orphans: [], fix: expect.any(String) });
  });

  test('every row names doors that exist', () => {
    const empty = rows
      .filter((row) => !doors.some((door) => rowFor(rows, door) === row))
      .map((row) => row.path);

    expect(empty).toEqual([]);
  });

  test.each(rows.map((row) => [row.path, row]))(
    'the row for %s matches the code',
    (_path, row) => {
      const owned = doors.filter((door) => rowFor(rows, door) === row);

      expect({
        count: owned.length,
        sections: [
          ...new Set(owned.map((door) => door.sections.join(', '))),
        ].sort(),
      }).toEqual({
        count: row.count,
        sections: [row.sections.join(', ')],
      });
    }
  );

  /**
   * The whole reason step 1 of `saas.2.1` exists. Written as its own
   * assertion rather than left to the table above, because a table row is a
   * thing to update and this is a decision to keep.
   */
  test('starting a channel connection needs an administrator', () => {
    const door = doors.find(
      (candidate) =>
        candidate.method === 'GET' &&
        candidate.path === '/integrations/social/:integration'
    );

    expect(door?.sections).toEqual(['CHANNEL', 'ADMIN']);
  });

  /**
   * Found by the 03.09 audit: the connection had gone under an administrator
   * while removing the channel — with every post on it — had stayed open to
   * any member. A channel is the organization's asset at both ends.
   */
  test.each([
    ['DELETE', '/integrations'],
    ['POST', '/integrations/disable'],
    ['POST', '/integrations/enable'],
  ])('%s %s needs an administrator', (method, path) => {
    const door = doors.find(
      (candidate) => candidate.method === method && candidate.path === path
    );

    expect(door?.sections).toEqual(['ADMIN']);
  });
});

describe('the guard exemption is the one the matrix prints', () => {
  const declared = [
    ...read(GUARD).matchAll(/^\s*'(\/[a-z0-9/-]+)',$/gm),
  ].map((match) => match[1]);

  test('the code exempts exactly the paths the document lists', () => {
    const document = read(MATRIX);
    const listed = [...document.matchAll(/^- `(\/[a-z0-9/-]+)` —/gm)].map(
      (match) => match[1]
    );

    expect([...declared].sort()).toEqual([...listed].sort());
  });

  /**
   * The defect this replaced: `/integrations/provider` sat in that list and
   * turned off the check on a door the application calls with a session.
   */
  test('no door the application calls with a session is exempt', () => {
    const doors = doorsWithPolicies().filter(
      (door) => door.file.indexOf('no.auth') === -1
    );
    const exempt = doors.filter((door) =>
      declared.some((prefix) => covers(prefix, door.path))
    );

    expect(exempt.map((door) => `${door.method} ${door.path}`)).toEqual([]);
  });
});

describe('the invitation door is documented separately from organization-role policy', () => {
  test('/user/join-org names its signed-token, email-binding, and single-use rules', () => {
    const document = read(MATRIX);

    expect(document).toContain('| `/user/join-org` |');
    expect(document).toContain('подписанного приглашения');
    expect(document).toContain('однораз');
    expect(document).toContain('адрес');
  });
});

describe('the roles themselves', () => {
  const rolesSource = read(ROLES);
  const schema = read(SCHEMA);

  const enumRoles = (
    schema.match(/enum Role \{([\s\S]*?)\n\}/)?.[1] || ''
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z_]+$/.test(line));

  const assignable = (
    rolesSource.match(
      /ASSIGNABLE_ORGANIZATION_ROLES = \[([\s\S]*?)\] as const/
    )?.[1] || ''
  )
    .split(',')
    .map((entry) => entry.trim().replace(/'/g, ''))
    .filter(Boolean);

  const ranked = [
    ...(rolesSource.match(/ROLE_LEVEL[^{]*\{([\s\S]*?)\n\};/)?.[1] || '')
      .matchAll(/(\w+):\s*(\d+)/g),
  ].map(([, role, level]) => [role, Number(level)]);

  // Sorted copies throughout: `sort` mutates, and a test that reorders the
  // declaration order would quietly change what a later one is comparing.
  const sorted = (values) => [...values].sort();

  test('the schema knows the four roles the product has', () => {
    expect(sorted(enumRoles)).toEqual(['ADMIN', 'EDITOR', 'SUPERADMIN', 'USER']);
  });

  test('every role in the schema has a rank', () => {
    expect(sorted(ranked.map(([role]) => role))).toEqual(sorted(enumRoles));
  });

  test('an administrator may hand out every role but their own instance one', () => {
    expect(sorted(assignable)).toEqual(
      sorted(enumRoles.filter((role) => role !== 'SUPERADMIN'))
    );
  });

  /**
   * The chain this table replaced ended in the highest rank, so a role it did
   * not name — every new one — arrived as a superadmin.
   */
  test('an unknown role does not rank above a member', () => {
    const { organizationRoleLevel } = loadTypeScriptModule(ROLES);

    expect(organizationRoleLevel('DEPUTY_EMPEROR')).toBe(0);
    expect(organizationRoleLevel(undefined)).toBe(0);
    expect(organizationRoleLevel('SUPERADMIN')).toBe(
      Math.max(...ranked.map(([, level]) => level))
    );
  });

  test('the team screen offers every assignable role, each with a meaning', () => {
    const screen = read(TEAM_SCREEN);
    const offered = [
      ...screen.matchAll(/value: '([A-Z_]+)',\n\s*name: t\(/g),
    ].map((match) => match[1]);

    expect(offered).toEqual(assignable);
    for (const role of assignable) {
      expect(screen).toMatch(
        new RegExp(`'role_${role.toLowerCase()}_meaning',`)
      );
    }
  });
});

describe('settings navigation follows the role matrix', () => {
  const settings = read(SETTINGS_SCREEN);
  const globalSettings = read(GLOBAL_SETTINGS);
  const matrix = read(MATRIX);

  test('the matrix names the tabs visible to each workspace role', () => {
    expect(matrix).toContain('## Экран настроек');
    expect(matrix).toContain('| `USER` и `EDITOR` |');
    expect(matrix).toContain('| `ADMIN` |');
    expect(matrix).toContain('| `SUPERADMIN` |');
  });

  test('administrator-only tabs and global blocks use the shared role helper', () => {
    expect(settings).toContain(
      "import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';"
    );
    expect(settings).toContain('const isAdmin = isOrganizationAdmin(user?.role);');
    expect(settings).toMatch(
      /if \(isAdmin\) \{\s+arr\.push\(\{ tab: 'teams'/
    );
    expect(settings).toMatch(
      /if \(isAdmin\) \{\s+arr\.push\(\{ tab: 'api'/
    );
    expect(globalSettings).toContain('const isAdmin = isOrganizationAdmin(user?.role);');
    expect(globalSettings).toMatch(/isAdmin && <ShortlinkPreferenceComponent \/>/);
    expect(globalSettings).toMatch(/isAdmin && <AiProviderComponent \/>/);
  });

  test('a member opening an administrator tab from the address bar gets an in-page restriction', () => {
    expect(settings).toContain("const requestedTab = url.get('tab');");
    expect(settings).toContain('requestedTab ?? initialSettingsTab(url)');
    expect(settings).toContain('RestrictedState');
    expect(settings).toContain('settings_admin_role_required_title');
    expect(settings).toContain('settings_admin_role_required_reason');
  });
});
