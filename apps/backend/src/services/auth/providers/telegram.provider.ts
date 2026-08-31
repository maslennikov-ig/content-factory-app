import {
  AuthProvider,
  AuthProviderAbstract,
} from '@contentfactory/backend/services/auth/providers.interface';
import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import type { JWK } from 'jose';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_AUTH_URL = `${TELEGRAM_ISSUER}/auth`;
const TELEGRAM_TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
const TELEGRAM_JWKS_URL = `${TELEGRAM_ISSUER}/.well-known/jwks.json`;
const TELEGRAM_ALGORITHMS = ['RS256', 'ES256', 'EdDSA', 'ES256K'];
const PKCE_TTL_SECONDS = 300;
const JWKS_TTL_MILLISECONDS = 60 * 60 * 1000;
// Telegram is a third party on the critical path of a login request. Without a
// deadline a hung endpoint holds the Nest request open indefinitely.
const TELEGRAM_REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/**
 * Constant-time comparison that tolerates different lengths, which
 * `timingSafeEqual` alone rejects by throwing.
 */
function sameSecret(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

type TelegramConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  settingsRedirectUri: string;
};

type TelegramPkceState = {
  verifier: string;
  redirectUri: string;
};

@AuthProvider({
  provider: 'TELEGRAM',
})
export class TelegramProvider extends AuthProviderAbstract {
  private jwksCache?: { keys: JWK[]; expiresAt: number };

  private getConfig(): TelegramConfig {
    const { TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, FRONTEND_URL } =
      process.env;
    if (!TELEGRAM_CLIENT_ID || !TELEGRAM_CLIENT_SECRET || !FRONTEND_URL) {
      throw new Error('Telegram login is not configured');
    }

    const frontendUrl = FRONTEND_URL.replace(/\/$/, '');
    return {
      clientId: TELEGRAM_CLIENT_ID,
      clientSecret: TELEGRAM_CLIENT_SECRET,
      redirectUri: `${frontendUrl}/auth?provider=TELEGRAM`,
      settingsRedirectUri: new URL('/settings', frontendUrl).toString(),
    };
  }

  private stateKey(state: string) {
    return `auth:telegram:pkce:${state}`;
  }

  private selectRedirectUri(requested?: string) {
    const config = this.getConfig();
    if (!requested) return config.redirectUri;

    let parsed: URL;
    try {
      parsed = new URL(requested);
    } catch {
      throw new Error('Invalid Telegram redirect URI');
    }
    if (parsed.toString() === config.redirectUri) return config.redirectUri;
    if (
      parsed.toString() !== config.settingsRedirectUri ||
      parsed.origin !== new URL(config.redirectUri).origin
    ) {
      throw new Error('Invalid Telegram redirect URI');
    }
    return config.settingsRedirectUri;
  }

  private readPkceState(value: string, fallbackRedirectUri: string) {
    try {
      const parsed = JSON.parse(value) as Partial<TelegramPkceState>;
      if (
        typeof parsed.verifier === 'string' &&
        parsed.verifier &&
        typeof parsed.redirectUri === 'string' &&
        parsed.redirectUri
      ) {
        return parsed as TelegramPkceState;
      }
    } catch {
      // States issued by the previous version contain only the verifier. They
      // remain valid for their five-minute lifetime and use the login URI.
    }
    return { verifier: value, redirectUri: fallbackRedirectUri };
  }

  async generateLink(query?: { redirect_uri?: string }): Promise<string> {
    const { clientId } = this.getConfig();
    const redirectUri = this.selectRedirectUri(query?.redirect_uri);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    await ioRedis.set(
      this.stateKey(state),
      JSON.stringify({ verifier, redirectUri } satisfies TelegramPkceState),
      'EX',
      PKCE_TTL_SECONDS
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    return `${TELEGRAM_AUTH_URL}?${params.toString()}`;
  }

  async getToken(
    code: string,
    redirectUri?: string,
    callback?: AuthCallbackContext
  ): Promise<string> {
    const config = this.getConfig();
    const requestedRedirectUri = redirectUri
      ? this.selectRedirectUri(redirectUri)
      : undefined;

    const state = callback?.state;
    const browserState = callback?.browserState;
    if (!state) {
      throw new Error('Invalid or expired Telegram login state');
    }
    // The cookie is what makes this browser the one that started the flow. A
    // callback carrying somebody else's code and state arrives without it, or
    // with a different value, and never reaches the token endpoint.
    if (!browserState || !sameSecret(browserState, state)) {
      throw new Error('Telegram login state does not belong to this browser');
    }

    const storedState = await ioRedis.getdel(this.stateKey(state));
    if (!storedState) {
      throw new Error('Invalid or expired Telegram login state');
    }
    const pkce = this.readPkceState(storedState, config.redirectUri);
    const selectedRedirectUri = this.selectRedirectUri(pkce.redirectUri);
    if (requestedRedirectUri && requestedRedirectUri !== selectedRedirectUri) {
      throw new Error('Invalid Telegram redirect URI');
    }

    const response = await fetch(TELEGRAM_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MILLISECONDS),
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.clientId}:${config.clientSecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: selectedRedirectUri,
        code_verifier: pkce.verifier,
      }),
    });
    if (!response.ok) {
      throw new Error('Telegram token request failed');
    }

    const { id_token: idToken } = await response.json();
    if (typeof idToken !== 'string' || !idToken) {
      throw new Error('Telegram returned no id_token');
    }
    await this.verifyIdToken(idToken);
    return idToken;
  }

  async getUser(providerToken: string) {
    const payload = await this.verifyIdToken(providerToken);
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('Telegram id_token is missing a subject');
    }
    return {
      id: payload.sub,
      email: `telegram_${payload.sub}`,
    };
  }

  private async verifyIdToken(idToken: string) {
    const { clientId } = this.getConfig();
    const header = decodeProtectedHeader(idToken);
    if (
      typeof header.alg !== 'string' ||
      !TELEGRAM_ALGORITHMS.includes(header.alg)
    ) {
      throw new Error('Telegram id_token uses an unsupported algorithm');
    }
    if (typeof header.kid !== 'string' || !header.kid) {
      throw new Error('Telegram id_token is missing a key identifier');
    }

    let keys = await this.getJwks();
    let jwk = keys.find((candidate) => candidate.kid === header.kid);
    if (!jwk) {
      keys = await this.getJwks(true);
      jwk = keys.find((candidate) => candidate.kid === header.kid);
    }
    if (!jwk) {
      throw new Error('Telegram id_token references an unknown key');
    }

    // A published key that names its own algorithm decides which one applies.
    // Taking the algorithm from the token header alone would let a caller pick
    // how their own signature is checked.
    if (typeof jwk.alg === 'string' && jwk.alg !== header.alg) {
      throw new Error('Telegram id_token algorithm does not match its key');
    }

    const key = await importJWK(jwk, header.alg);
    const { payload } = await jwtVerify(idToken, key, {
      algorithms: [header.alg],
      audience: clientId,
      issuer: TELEGRAM_ISSUER,
      requiredClaims: ['sub', 'exp'],
    });
    return payload;
  }

  private async getJwks(forceRefresh = false): Promise<JWK[]> {
    if (
      !forceRefresh &&
      this.jwksCache &&
      this.jwksCache.expiresAt > Date.now()
    ) {
      return this.jwksCache.keys;
    }

    const response = await fetch(TELEGRAM_JWKS_URL, {
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MILLISECONDS),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Telegram JWKS request failed');
    }
    const body = (await response.json()) as { keys?: JWK[] };
    if (!Array.isArray(body.keys) || !body.keys.length) {
      throw new Error('Telegram JWKS response contains no keys');
    }

    this.jwksCache = {
      keys: body.keys,
      expiresAt: Date.now() + JWKS_TTL_MILLISECONDS,
    };
    return body.keys;
  }
}
