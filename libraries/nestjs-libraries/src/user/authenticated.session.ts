import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
const session = new AsyncLocalStorage<{actorId: string; digest: string}>();
/** Original verified principal, before any administrative impersonation. Never a credential. */
export const withAuthenticatedSession = <T>(actorId: string, token: string, run: () => T): T =>
  session.run({actorId, digest: createHash('sha256').update(token).digest('hex')}, run);
export const authenticatedSession = () => session.getStore();
