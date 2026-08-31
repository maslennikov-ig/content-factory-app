import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_SECONDS = 300;

function stateKey(provider: string, state: string) {
  return `auth:${provider.toLowerCase()}:state:${state}`;
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueOAuthState(provider: string, redirectUri: string) {
  const state = randomBytes(32).toString('base64url');
  await ioRedis.set(
    stateKey(provider, state),
    JSON.stringify({ redirectUri }),
    'EX',
    STATE_TTL_SECONDS
  );
  return state;
}

export async function consumeOAuthState(
  provider: string,
  requestedRedirectUri: string | undefined,
  callback?: AuthCallbackContext
) {
  const state = callback?.state;
  const browserState = callback?.browserState;
  if (!state) throw new Error(`Invalid or expired ${provider} OAuth state`);
  if (!browserState || !sameSecret(browserState, state)) {
    throw new Error(`${provider} OAuth state does not belong to this browser`);
  }

  const stored = await ioRedis.getdel(stateKey(provider, state));
  if (!stored) throw new Error(`Invalid or expired ${provider} OAuth state`);

  let redirectUri: unknown;
  try {
    redirectUri = JSON.parse(stored).redirectUri;
  } catch {
    throw new Error(`Invalid or expired ${provider} OAuth state`);
  }
  if (typeof redirectUri !== 'string' || !redirectUri) {
    throw new Error(`Invalid or expired ${provider} OAuth state`);
  }
  if (requestedRedirectUri && requestedRedirectUri !== redirectUri) {
    throw new Error(`Invalid ${provider} OAuth redirect URI`);
  }
  return redirectUri;
}
