/**
 * What a workspace is called on screen when nobody called it anything.
 *
 * The name field on registration is optional, and until
 * `content-factory-next-fn33.125` an empty one became the literal string
 * `'Workspace'` — written by the server, which had no language to write it in.
 * A person registering in Russian ended up with the one English word on the
 * page as the name of their own workplace.
 *
 * New workspaces are named in the reader's language on the server now. The
 * ones already carrying `'Workspace'` are left as they are in the database:
 * renaming rows would rewrite a name somebody might have typed on purpose, and
 * a data migration cannot tell the two apart. So the reading happens here
 * instead — and only for the exact literal. `My Workspace` and `Workspace of
 * Ivan` are names a person chose, and they stay.
 */

export const LEGACY_DEFAULT_WORKSPACE_NAME = 'Workspace';

export type TranslateLike = (key: string, fallback: string) => string;

export const workspaceDisplayName = (
  name: string | null | undefined,
  t?: TranslateLike
): string => {
  const translated =
    t?.('workspace_default_name', LEGACY_DEFAULT_WORKSPACE_NAME) ||
    LEGACY_DEFAULT_WORKSPACE_NAME;
  if (!name || !name.trim()) return translated;
  return name === LEGACY_DEFAULT_WORKSPACE_NAME ? translated : name;
};
