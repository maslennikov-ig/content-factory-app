'use strict';

/**
 * `content-factory-next-fn33.19`: the product hands out `Role.SUPERADMIN` to
 * nobody.
 *
 * Two different rights carried that name. `User.isSuperAdmin` is the instance
 * operator — `/admin/users`, approvals, the Telegram binding — and it stays.
 * `Role.SUPERADMIN` on a `UserOrganization` was a workspace membership, given
 * to whoever registered, and the team screen printed it as «Супер
 * администратор» beside people who were merely administrators of their own
 * workspace. The owner's decision on 04.09.2026 is that registration grants
 * `ADMIN` or the role written into the invitation, and nothing else.
 *
 * The enum value itself is deliberately kept: rows already carrying it exist
 * on running instances, and changing a Postgres enum is a separate, dangerous
 * step (see the runbook). So the rule this guard enforces is narrow and
 * exact — the value may still be *read* and *compared*, it may never be
 * *assigned*.
 *
 * Reads that must keep working, and therefore are not violations:
 *
 *  - `ROLE_LEVEL` and `isOrganizationAdmin` in `organization.roles.ts`;
 *  - `in` / `notIn` filters that keep old rows behaving like administrators;
 *  - `=== 'SUPERADMIN'` comparisons.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const SOURCE_ROOTS = ['apps', 'libraries'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.next',
  'generated',
]);

/**
 * An assignment of the role: the shape `role: SUPERADMIN` in an object
 * literal, whether the value comes from the Prisma enum or is spelled out as
 * a string. This is how every one of the three places that used to grant it
 * was written, and how a fourth would be.
 */
const ASSIGNMENT = /\brole\s*:\s*(?:Role\s*\.\s*SUPERADMIN|['"]SUPERADMIN['"])/;

const sourceFiles = (directory) => {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(child);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
  });
};

describe('Role.SUPERADMIN is never granted', () => {
  const files = SOURCE_ROOTS.flatMap((directory) => sourceFiles(directory));

  test('the search actually reaches the code it is guarding', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(
      'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts'
    );
  });

  test('no source file assigns it to a membership', () => {
    const offenders = files.filter((file) =>
      fs
        .readFileSync(path.join(root, file), 'utf8')
        .split('\n')
        .some((line) => ASSIGNMENT.test(line))
    );

    expect(offenders).toEqual([]);
  });

  test('the three places that used to grant it now grant ADMIN', () => {
    const organizations = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts'
      ),
      'utf8'
    );
    const publicApi = fs.readFileSync(
      path.join(root, 'apps/backend/src/services/auth/public.auth.middleware.ts'),
      'utf8'
    );

    // `createOrgAndUser`, `createMaxUser` and `createOrgForUser`: whoever a
    // workspace is created for. The third is `content-factory-next-fn33.36`,
    // a second workspace made from inside the product.
    expect(organizations.match(/role: Role\.ADMIN,/g)).toHaveLength(3);
    // The public API key, which stands in for an administrator of the
    // workspace it belongs to.
    expect(publicApi.match(/role: 'ADMIN'/g)).toHaveLength(2);
  });

  test('the enum value survives, and so does reading it', () => {
    const schema = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
      ),
      'utf8'
    );
    const roles = fs.readFileSync(
      path.join(root, 'libraries/nestjs-libraries/src/user/organization.roles.ts'),
      'utf8'
    );

    // Removing it from the enum is a migration on a live database, not a
    // code change; until then old rows must still parse.
    expect(schema).toMatch(/enum Role \{[\s\S]*SUPERADMIN[\s\S]*\}/);
    expect(roles).toContain('SUPERADMIN: 2');
    expect(roles).toContain("role === 'ADMIN' || role === 'SUPERADMIN'");
  });

  test('an existing SUPERADMIN row keeps every administrator exemption', () => {
    const repository = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts'
      ),
      'utf8'
    );

    // Both the «who stays enabled when the subscription lapses» filter and
    // the «how many administrators are left» count name the two roles
    // together. Naming only `ADMIN` would switch off, or orphan, the owners
    // of every workspace created before this change.
    // С fn33.102 пара ролей записана один раз, а не переписана у каждого
    // запроса: список назван, и оба фильтра читают его.
    expect(repository).toContain(
      'const ADMINISTRATOR_ROLES = [Role.SUPERADMIN, Role.ADMIN];'
    );
    expect(repository).toContain('notIn: ADMINISTRATOR_ROLES');
    expect(repository).toContain('in: ADMINISTRATOR_ROLES');
  });
});
