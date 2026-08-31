import {
  AuthProvider,
  AuthProviderAbstract,
} from '@contentfactory/backend/services/auth/providers.interface';
import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { randomBytes, timingSafeEqual } from 'node:crypto';

// Long enough that a slow identity provider screen still completes, short
// enough that an abandoned attempt cannot be resumed later.
const STATE_TTL_SECONDS = 300;
const OAUTH_REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/**
 * Constant-time comparison that tolerates different lengths, which
 * `timingSafeEqual` alone rejects by throwing.
 */
function sameSecret(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

@AuthProvider({ provider: 'GENERIC' })
export class OauthProvider extends AuthProviderAbstract {
  private getConfig() {
    const {
      CONTENT_FACTORY_OAUTH_AUTH_URL,
      CONTENT_FACTORY_OAUTH_CLIENT_ID,
      CONTENT_FACTORY_OAUTH_CLIENT_SECRET,
      CONTENT_FACTORY_OAUTH_TOKEN_URL,
      CONTENT_FACTORY_OAUTH_USERINFO_URL,
      FRONTEND_URL,
    } = process.env;

    if (
      !CONTENT_FACTORY_OAUTH_USERINFO_URL ||
      !CONTENT_FACTORY_OAUTH_TOKEN_URL ||
      !CONTENT_FACTORY_OAUTH_CLIENT_ID ||
      !CONTENT_FACTORY_OAUTH_CLIENT_SECRET ||
      !CONTENT_FACTORY_OAUTH_AUTH_URL ||
      !FRONTEND_URL
    ) {
      throw new Error('CONTENT_FACTORY_OAUTH environment variables are not set');
    }

    return {
      authUrl: CONTENT_FACTORY_OAUTH_AUTH_URL,
      clientId: CONTENT_FACTORY_OAUTH_CLIENT_ID,
      clientSecret: CONTENT_FACTORY_OAUTH_CLIENT_SECRET,
      tokenUrl: CONTENT_FACTORY_OAUTH_TOKEN_URL,
      userInfoUrl: CONTENT_FACTORY_OAUTH_USERINFO_URL,
      // Unchanged on purpose: this exact URI is registered at the identity
      // provider, and rewriting it would lock out every existing deployment.
      // `/settings` reached without a session is turned into
      // `/auth?...&provider=GENERIC` by the frontend proxy, query string and
      // all, so `code` and `state` both survive the hop.
      redirectUri: `${FRONTEND_URL}/settings`,
    };
  }

  private stateKey(state: string) {
    return `auth:generic:state:${state}`;
  }

  async generateLink(): Promise<string> {
    const { authUrl, clientId, redirectUri } = this.getConfig();
    const state = randomBytes(32).toString('base64url');

    // The value carries no secret: what matters is that the key exists exactly
    // once, so a code can be exchanged once and only for a live attempt.
    await ioRedis.set(this.stateKey(state), '1', 'EX', STATE_TTL_SECONDS);

    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'openid profile email',
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });

    return `${authUrl}?${params.toString()}`;
  }

  async getToken(
    code: string,
    redirectUri?: string,
    callback?: AuthCallbackContext
  ): Promise<string> {
    const config = this.getConfig();
    if (redirectUri && redirectUri !== config.redirectUri) {
      throw new Error('Invalid OAuth redirect URI');
    }

    const state = callback?.state;
    const browserState = callback?.browserState;
    if (!state) {
      throw new Error('Invalid or expired OAuth login state');
    }
    // The cookie is what makes this browser the one that started the flow. A
    // callback carrying somebody else's code and state arrives without it, or
    // with a different value, and never reaches the token endpoint.
    if (!browserState || !sameSecret(browserState, state)) {
      throw new Error('OAuth login state does not belong to this browser');
    }

    const started = await ioRedis.getdel(this.stateKey(state));
    if (!started) {
      throw new Error('Invalid or expired OAuth login state');
    }

    const response = await fetch(`${config.tokenUrl}`, {
      method: 'POST',
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MILLISECONDS),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const { userInfoUrl } = this.getConfig();
    const response = await fetch(`${userInfoUrl}`, {
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MILLISECONDS),
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    const { email, sub: id } = await response.json();
    return { email, id };
  }
}
