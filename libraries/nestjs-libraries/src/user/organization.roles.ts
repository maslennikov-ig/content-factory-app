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
 * `EDITOR` and `USER` share a level on purpose, and the level is not the same
 * question as the doors.
 *
 * The level answers exactly one thing: whether the person acting outranks the
 * person acted upon, which is what `/settings/team` needs to know before it
 * removes somebody or changes their role. Neither `USER` nor `EDITOR` removes
 * anyone, so they are peers here — and they stay peers after 05.09.2026, when
 * the owner gave the editor the content doors. A role that may write the
 * brand voice still may not delete a colleague, and nothing in this table
 * should be read as saying otherwise.
 *
 * What separates the two roles is `isOrganizationEditor` below and the doors
 * that name `Sections.EDITOR`; `docs/product/roles-matrix.md` lists them.
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
 * `true` for everyone who may make the workspace's content: the editor and
 * both administrators.
 *
 * Owner decision of 05.09.2026 (`content-factory-next-fn33.90`, option «в»).
 * Until that day `EDITOR` was a name with no door behind it — the live
 * walkthrough of 04.09 put the two roles through the same circle and the two
 * recordings matched byte for byte. The editor now writes posts, the brand
 * voice and its avatars, the source register and the facts built on it,
 * briefs, materials and idea feeds. What stays with the administrator is the
 * workspace's shared property rather than its content: channels, people,
 * model keys and spend, webhooks, OAuth applications, short links.
 *
 * Written as its own predicate rather than as `!isOrganizationUser` so that a
 * role this build has never heard of falls out of both, the same way it falls
 * to the bottom of `ROLE_LEVEL`: an unknown role is not a licence.
 *
 * Both halves of the product read this one function. The server reaches it
 * through `Sections.EDITOR` in `permissions.service.ts`, and every screen that
 * hides an action reaches it directly — so a button and the door behind it
 * cannot disagree about who may press it.
 */
export const isOrganizationEditor = (
  role: string | null | undefined
): boolean => role === 'EDITOR' || isOrganizationAdmin(role);

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
