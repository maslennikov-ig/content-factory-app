/**
 * The roles a person can hold inside one workspace, and the only ranking the
 * product has between them.
 *
 * This file exists because the ranking used to be a ternary chain, written out
 * by hand in `organization.service.ts` and again in `teams.component.tsx`:
 *
 *     role === 'USER' ? 0 : role === 'ADMIN' ? 1 : 2
 *
 * Read that with a role it does not name and it answers `2` — superadmin. A
 * chain whose fall-through is the highest authority in the product cannot be
 * extended safely, and adding `EDITOR` to it would have handed every editor
 * the level that decides who may remove whom. One table, one lookup, and an
 * unknown role lands at the bottom instead of the top.
 *
 * Deliberately free of any `@prisma/client` import: the team screen reads the
 * same ranking in the browser, and pulling the database client into that
 * bundle to learn four strings would be a poor trade.
 */

export type OrganizationRole = 'USER' | 'EDITOR' | 'ADMIN' | 'SUPERADMIN';

/**
 * `EDITOR` and `USER` share a level on purpose. They are peers in authority —
 * neither may remove anyone — and the level answers exactly one question:
 * whether the person acting outranks the person acted upon. What separates
 * the two roles is the name and what it tells the workspace it invited, not a
 * door; `docs/product/roles-matrix.md` says so in full rather than leaving the
 * reader to infer it from an equal number here.
 */
const ROLE_LEVEL: Record<OrganizationRole, number> = {
  USER: 0,
  EDITOR: 0,
  ADMIN: 1,
  SUPERADMIN: 2,
};

/**
 * The rank of a role, and `0` — the bottom — for anything unrecognised. An
 * unknown role is a role this build has never heard of; treating it as the
 * most powerful one is the failure this module was extracted to prevent.
 */
export const organizationRoleLevel = (
  role: string | null | undefined
): number => ROLE_LEVEL[role as OrganizationRole] ?? 0;

/** `true` for the two roles the permission check calls an administrator. */
export const isOrganizationAdmin = (role: string | null | undefined): boolean =>
  role === 'ADMIN' || role === 'SUPERADMIN';

/**
 * The roles an administrator may hand out when inviting someone.
 * `SUPERADMIN` is kept in the enum for upstream compatibility only: since
 * 04.09.2026 (`content-factory-next-fn33.19`) nothing grants it — the creator
 * of an organization is `ADMIN` — and the team screen never offers it.
 */
export const ASSIGNABLE_ORGANIZATION_ROLES = [
  'USER',
  'EDITOR',
  'ADMIN',
] as const;

export type AssignableOrganizationRole =
  (typeof ASSIGNABLE_ORGANIZATION_ROLES)[number];
