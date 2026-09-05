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
// The reading of the decorators lives next door since 05.09.2026: this guard
// and `role-doors.three-roles.test.cjs` must not disagree about what the
// doors are (`content-factory-next-fn33.90`).
const { doorsWithPolicies } = require('./helpers/backend-doors.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const MATRIX = 'docs/product/roles-matrix.md';
const GUARD = 'apps/backend/src/services/auth/permissions/permissions.guard.ts';
const ROLES = 'libraries/nestjs-libraries/src/user/organization.roles.ts';
const SCHEMA = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const TEAM_SCREEN = 'apps/frontend/src/components/settings/teams.component.tsx';
const SETTINGS_SCREEN = 'apps/frontend/src/components/layout/settings.component.tsx';
const GLOBAL_SETTINGS = 'apps/frontend/src/components/settings/global.settings.tsx';

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
        // A comma joins the policies on one door; a semicolon separates doors
        // under the same row that carry different ones. `/webhooks` needs
        // both: `POST` there is a plan limit and a role, `PUT` on the very
        // same path is the role alone, and no split by path can tell them
        // apart. Before 05.09.2026 every row happened to hold one combination
        // and the cell was read as a single list.
        sections: cells[1]
          .split(';')
          .map((combination) =>
            combination
              .split(',')
              .map((section) => section.trim())
              .filter(Boolean)
              .join(', ')
          )
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
        sections: [...row.sections].sort(),
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

  /**
   * `content-factory-next-fn33.5`. Refusal used to be a client-side state and
   * the matrix said so. It is a door now, with the same authority as
   * acceptance, and a door the matrix does not name is a door nobody reviews.
   */
  test('/user/join-org/decline is a door of its own with the same authority', () => {
    const document = read(MATRIX);
    const controller = read('apps/backend/src/api/routes/users.controller.ts');

    expect(document).toContain('| `/user/join-org/decline` |');
    expect(document).not.toContain('Кнопка отказа не вызывает эту дверь');
    expect(controller).toContain("@Post('/join-org/decline')");
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
    // Separate rows since 05.09.2026: the two roles no longer see the same
    // screen, and one row for both would be the very claim
    // `content-factory-next-fn33.90` was opened to remove.
    expect(matrix).toContain('| `USER` |');
    expect(matrix).toContain('| `EDITOR` |');
    expect(matrix).toContain('| `ADMIN` |');
    expect(matrix).toContain('| `SUPERADMIN` |');
    expect(matrix).not.toContain('| `USER` и `EDITOR` |');
  });

  test('administrator-only tabs and global blocks use the shared role helper', () => {
    expect(settings).toContain('isOrganizationAdmin');
    expect(settings).toContain(
      "} from '@contentfactory/nestjs-libraries/user/organization.roles';"
    );
    expect(settings).toContain('const isAdmin = isOrganizationAdmin(user?.role);');
    expect(settings).toMatch(
      /if \(isAdmin\) \{\s+arr\.push\(\{ tab: 'teams'/
    );
    expect(settings).toMatch(
      /if \(isAdmin\) \{\s+arr\.push\(\{ tab: 'api'/
    );
    expect(settings).toMatch(
      /if \(isAdmin\) \{\s+arr\.push\(\{ tab: 'webhooks'/
    );
    expect(globalSettings).toContain('const isAdmin = isOrganizationAdmin(user?.role);');
    expect(globalSettings).toMatch(/isAdmin && <ShortlinkPreferenceComponent \/>/);
    expect(globalSettings).toMatch(/isAdmin && <AiProviderComponent \/>/);
  });

  /**
   * `content-factory-next-fn33.90`. Three tabs whose every control writes
   * moved to the editor, and one — webhooks — moved the other way. A tab on
   * which every button would be refused is not information; it is a promise.
   */
  test('editor-only tabs use the shared editor helper', () => {
    expect(settings).toContain(
      'const isEditor = isOrganizationEditor(user?.role);'
    );
    expect(settings).toMatch(
      /if \(isEditor\) \{\s+arr\.push\(\{ tab: 'autopost'/
    );
    for (const tab of ['sets', 'signatures']) {
      expect(settings).toContain(`arr.push({ tab: '${tab}'`);
    }
  });

  /**
   * The tab names the document uses, in the same words a person reads on the
   * screen. Square brackets are the document's own mark for a tab only an
   * administrator sees.
   */
  const TAB_NAMES = {
    profile: 'Профиль',
    global_settings: 'Глобальные настройки',
    sign_in_methods: 'Способы входа',
    content_intelligence: '«Знания о контенте»',
    teams: '[Команды]',
    webhooks: '[Вебхуки]',
    autopost: '(Автопостинг)',
    sets: '(Наборы)',
    signatures: '(Подписи)',
    api: '[Разработчики]',
    approved_apps: 'Одобренные приложения',
    onboarding: '«С чего начать»',
    about: '«О проекте»',
  };

  test('the order the document promises is the order the screen builds', () => {
    // `content-factory-next-fn33.106`: the document put «Разработчики» last
    // and the screen puts them between «Подписи» and «Одобренные приложения».
    // A written order that nobody checks drifts from the screen it describes,
    // and the person following the document looks for a tab where it is not.
    const codeOrder = [...settings.matchAll(/arr\.push\(\{\s*tab: '([a-z_]+)'/g)].map(
      (match) => match[1]
    );
    expect(codeOrder.length).toBeGreaterThan(5);
    for (const tab of codeOrder) {
      expect(Object.keys(TAB_NAMES)).toContain(tab);
    }

    const written = matrix.match(/Порядок вкладок на экране: ([^—]+)—/u);
    expect(written).not.toBeNull();
    const documented = written[1]
      .replace(/\s+/gu, ' ')
      .trim()
      .split(', ');

    expect(documented).toEqual(codeOrder.map((tab) => TAB_NAMES[tab]));
  });

  test('a member opening a tab their role has not got gets an in-page restriction', () => {
    expect(settings).toContain("const requestedTab = url.get('tab');");
    expect(settings).toContain('requestedTab ?? initialSettingsTab(url)');
    expect(settings).toContain('RestrictedState');
    expect(settings).toContain('settings_admin_role_required_title');
    expect(settings).toContain('settings_admin_role_required_reason');
    // Two refusals, not one worded for both: an administrator is asked of the
    // workspace owner and an editor of the administrator.
    expect(settings).toContain('settings_editor_role_required_title');
    expect(settings).toContain('settings_editor_role_required_reason');
    expect(settings).toContain("restrictedTab === 'admin'");
    expect(settings).toContain("restrictedTab === 'editor'");
  });
});
