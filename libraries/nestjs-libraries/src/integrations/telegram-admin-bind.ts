import { randomBytes } from 'node:crypto';
import type { BackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';

/**
 * Binds one already-authenticated administrator to the Telegram chat they
 * send `/start <code>` from, so the approval queue can page them.
 *
 * This is deliberately server-generated, not client-generated like the
 * channel `/connect` word (`connect.word.ts`): a channel connect word is
 * shown to whoever is looking at the browser tab that asked for it, and
 * nothing downstream trusts it beyond "some chat replied first". A binding
 * code grants a standing subscription to who is waiting for approval, tied to
 * one specific, already-superadmin account — the browser that requested it is
 * already the trusted party, so the code only has to survive the trip from
 * that browser's screen into the Telegram app, which a server-issued value
 * does exactly as well as a client-issued one and with one fewer place
 * (`window.crypto` in every browsable context) that has to be trusted.
 */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 32 characters from a 64-character alphabet is 192 bits of entropy — the
 * same order of magnitude as the channel connect word (24 chars, 144 bits),
 * comfortably unguessable within the claim window below. `-_` keep the result
 * inside `[A-Za-z0-9_-]`, which is both what `TelegramUpdatesDto` already
 * validates for `/connect` and Telegram's own restriction on a `/start` deep
 * link payload.
 */
export const ADMIN_BIND_CODE_LENGTH = 32;

/**
 * Matches `connectClaimWindowMs` in `telegram.updates.service.ts`: a code an
 * administrator requested and never used is an abandoned attempt after this
 * long, not a live secret. Reusing the same fifteen minutes keeps the two
 * "prove you control this chat" flows in this file family on one number
 * instead of two that could quietly drift apart.
 */
export const ADMIN_BIND_CLAIM_WINDOW_MS = 15 * 60 * 1_000;

/**
 * `randomBytes` over `Math.random`-backed `makeId`: the code hands out a
 * standing subscription to a security-relevant notification stream, and
 * `makeId`'s generator is exactly what `connect.word.ts` was written to stop
 * using for this same class of secret.
 *
 * 256 is divisible by 64, so `byte % ALPHABET.length` is uniform — no modulo
 * bias to correct for.
 */
export function generateAdminBindCode(
  length = ADMIN_BIND_CODE_LENGTH
): string {
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

/**
 * The reply to an unknown or expired code. It says nothing that would tell a
 * stranger sending random `/start <guess>` messages that a binding-code
 * system exists at all — no "code", no "expired", no "invalid". Anyone who
 * legitimately requested a code came from the admin page a moment earlier and
 * already knows what happened; this line is for everyone else.
 */
export function adminBindDeclineMessage(locale: BackendLocale): string {
  return locale === 'ru'
    ? 'Команда не распознана.'
    : 'Command not recognized.';
}

export function adminBindSuccessMessage(locale: BackendLocale): string {
  return locale === 'ru'
    ? 'Готово. Уведомления об очереди на одобрение будут приходить в этот чат.'
    : 'Done. Approval-queue notifications will be sent to this chat.';
}

/**
 * What an administrator with a bound chat is paged with when approval mode
 * writes a new, switched-off account to the database.
 */
export function pendingApprovalNotification(
  locale: BackendLocale,
  params: { email: string; createdAt: Date; adminUrl: string }
): string {
  const when = params.createdAt.toISOString();
  return locale === 'ru'
    ? `Новая заявка ждёт одобрения: ${params.email} (${when} UTC). Открыть очередь: ${params.adminUrl}`
    : `A new account is waiting for approval: ${params.email} (${when} UTC). Open the queue: ${params.adminUrl}`;
}
