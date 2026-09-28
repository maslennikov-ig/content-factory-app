import { z } from 'zod';
import type { CapabilityRunContext } from '../capability.types';
import { resolveTimeZone } from '../person-time';
import { codedFailure } from './selection';

/**
 * The zone a capability reads or writes local times in, when the call may
 * name it (review W3-19 P3-9 for `channel.times`; `content-factory-next-kcxz.42`
 * for the plan).
 *
 * The web chat has the browser's zone in the identity (`person-time.ts`, the
 * header the screen sends). An MCP call has no browser: its identity falls
 * back to the saved standard offset or UTC, which knows no summer time, so a
 * «10:00» or a «today» there is ambiguous. Decided: over MCP a call that
 * reads or writes a local time must name its IANA zone, else nothing is done
 * (`<PREFIX>_TIME_ZONE_REQUIRED`); a zone named in the chat is used as named;
 * an unknown zone is refused, never guessed (`<PREFIX>_TIME_ZONE_UNKNOWN`).
 */
export const namedTimeZoneInput = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe('IANA zone the times are in, e.g. Europe/Moscow; only when named (required over MCP)');

export const namedTimeZone = (
  ctx: Pick<CapabilityRunContext, 'entrance' | 'timeZone'>,
  named: string | undefined,
  options: {
    /** `CHANNEL`, `PLAN`: the prefix of the two refusal codes. */
    prefix: string;
    /** `false` when the call reads or writes no local time (an empty list). */
    needed?: boolean;
    /** What the refusal says was not done, e.g. «Nothing was changed.». */
    nothingDone: string;
    /** What the zone is for, in the MCP refusal, e.g. «Posting times». */
    subject: string;
  }
): string => {
  if (named !== undefined) {
    const zone = resolveTimeZone(named);
    if (!zone) {
      throw codedFailure(
        `${options.prefix}_TIME_ZONE_UNKNOWN`,
        `“${named}” is not a time zone we know; name an IANA zone such as Europe/Moscow. ${options.nothingDone}`
      );
    }
    return zone;
  }
  if (ctx.entrance === 'mcp' && options.needed !== false) {
    throw codedFailure(
      `${options.prefix}_TIME_ZONE_REQUIRED`,
      `${options.subject} over MCP need the zone they are in: pass timeZone as an IANA zone, e.g. Europe/Moscow. ${options.nothingDone}`
    );
  }
  return ctx.timeZone || 'UTC';
};
