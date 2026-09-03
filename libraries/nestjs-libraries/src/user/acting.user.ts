import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The person whose session the current work is running under, if there is one.
 *
 * Written once, at the request boundary, by the auth middleware that has just
 * resolved the session; read by anything that has to record who did something.
 * The first such reader is the AI ledger, which counted an organization and no
 * person, so «what has this member spent» had no answer.
 *
 * Why a context and not a parameter. The organization already travels as an
 * argument, and adding a second one beside it would mean touching every
 * signature between a controller and `AiUsageRecord` — including
 * `OpenaiService`'s seven wrappers and their callers, none of which have any
 * business knowing about a ledger. The actor is ambient in the way the
 * organization is not: it is a property of the request, the same for every
 * call made while serving it.
 *
 * What is deliberately absent is a setter that takes an arbitrary id. The
 * value is whatever the session resolved to, and nothing downstream may
 * nominate a different person to bill.
 *
 * Three ways to arrive with no actor, all of them honest and all of them
 * recorded as null rather than guessed at:
 *
 *  - scheduled and queued work — autoposting, Temporal activities — runs with
 *    no request at all;
 *  - the public API authenticates an organization's key, which is not a
 *    person;
 *  - the provider callbacks that finish an OAuth flow carry no session.
 */
const actingUser = new AsyncLocalStorage<string>();

/** Runs `callback` with `userId` as the acting person for everything inside. */
export const runAsActingUser = <T>(userId: string, callback: () => T): T =>
  actingUser.run(userId, callback);

/** The acting person's id, or `undefined` outside a session. */
export const getActingUserId = (): string | undefined => actingUser.getStore();
