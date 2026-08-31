/**
 * The wire between the avatar routes and screen 12.
 *
 * Its own file rather than an addition to `voice-profile.adapter.ts` for one
 * concrete reason: `tests/brand-voice.profile-tab.test.cjs` asserts that
 * module's `VOICE_ROUTES` equals an exact set of six paths, and it should keep
 * doing so — those six are the profile tab's, and a seventh belonging to a
 * different screen appearing in that object is drift, not growth.
 *
 * The paths are read out of `VOICE_SURFACES` rather than retyped, so a route
 * cannot drift away from the screen the contract gave it, and every field
 * arrives as `unknown` and is narrowed on the way in.
 */

import {
  VOICE_SURFACES,
  type VoiceScreenStateV1,
  type VoiceSurfaceKey,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { AvatarKind, AvatarRow } from './voice-avatars.screen';

const routeOf = (
  surface: VoiceSurfaceKey,
  method: 'GET' | 'POST' | 'DELETE',
  path?: string
): string => {
  const route = VOICE_SURFACES[surface].routes.find(
    (one) => one.method === method && (!path || one.path.endsWith(path))
  );
  if (!route) throw new Error(`no ${method} ${path ?? ''} route for ${surface}`);
  return route.path;
};

/** The five paths screen 12 uses, named by what each one does. */
export const AVATAR_ROUTES = Object.freeze({
  list: routeOf('avatars', 'GET'),
  create: routeOf('avatars', 'POST', '/avatars'),
  update: routeOf('avatars', 'POST', '/avatars/update'),
  makeDefault: routeOf('avatars', 'POST', '/avatars/default'),
  remove: routeOf('avatars', 'DELETE'),
});

/** The strip reads the same list, from its own route. */
export const RIBBON_ROUTE = routeOf('ribbon', 'GET');

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const SCREEN_STATES: readonly VoiceScreenStateV1[] = [
  'default',
  'loading',
  'empty',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
];

/**
 * One avatar, narrowed.
 *
 * `name` keeps `null` rather than collapsing to `''`: «Без имени» is a state
 * the screen draws, and an empty string would make it draw a nameless card as
 * though somebody had named it that.
 *
 * `analysed` is read from the answer and never inferred from the presence of a
 * version label. The server decides whether an avatar can write; a screen that
 * decides for itself is a screen that disagrees with the route that refuses.
 */
export function mapAvatarRow(value: unknown): AvatarRow {
  const row = asRecord(value);
  const name = typeof row.name === 'string' ? row.name : null;
  return {
    id: asString(row.id),
    name: name && name.trim() ? name : null,
    kind: (row.kind === 'BRAND' ? 'BRAND' : 'PERSON') as AvatarKind,
    isDefault: row.isDefault === true,
    analysed: row.analysed === true,
    ...(typeof row.versionLabel === 'string' && row.versionLabel
      ? { versionLabel: row.versionLabel }
      : {}),
    // Absent, not zero: `0` would claim the corpus was counted and found
    // empty, where absence says it was never counted for this avatar at all.
    ...(typeof row.sampleCount === 'number'
      ? { sampleCount: row.sampleCount }
      : {}),
    createdAt: asString(row.createdAt),
    ...(typeof row.activeSince === 'string' && row.activeSince
      ? { activeSince: row.activeSince }
      : {}),
    ...(row.hasPortrait === true ? { hasPortrait: true } : {}),
  };
}

export function mapAvatars(response: unknown): {
  state: VoiceScreenStateV1;
  avatars: readonly AvatarRow[];
  defaultAvatarId: string | null;
  limit: number;
  canManage: boolean;
  notice?: string;
} {
  const envelope = asRecord(response);
  const state = SCREEN_STATES.includes(envelope.state as VoiceScreenStateV1)
    ? (envelope.state as VoiceScreenStateV1)
    : 'default';
  return {
    state,
    avatars: asArray(envelope.avatars).map(mapAvatarRow),
    defaultAvatarId:
      typeof envelope.defaultAvatarId === 'string' && envelope.defaultAvatarId
        ? envelope.defaultAvatarId
        : null,
    // The ceiling travels with the answer. A screen holding its own copy of
    // the number says «восемь из восьми» over a server that would have taken
    // a ninth, or refuses a ninth the server would have accepted.
    limit: typeof envelope.limit === 'number' ? envelope.limit : 0,
    canManage: envelope.canManage === true,
    ...(asString(envelope.notice) ? { notice: asString(envelope.notice) } : {}),
  };
}
