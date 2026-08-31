import {
  AuthProvider,
  AuthProviderAbstract,
} from '@contentfactory/backend/services/auth/providers.interface';
import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import {
  consumeOAuthState,
  issueOAuthState,
} from '@contentfactory/backend/services/auth/providers/oauth.state';
import { loadGoogleApis } from '@contentfactory/nestjs-libraries/integrations/social/google.sdk';

const defaultRedirect = () =>
  `${process.env.FRONTEND_URL}/integrations/social/youtube`;

const settingsRedirect = () =>
  new URL('/settings', process.env.FRONTEND_URL).toString();

const selectRedirect = (requested?: string) => {
  if (!requested) return defaultRedirect();
  if (requested === defaultRedirect() || requested === settingsRedirect()) {
    return requested;
  }

  throw new Error('Invalid GOOGLE OAuth redirect URI');
};

// The SDK comes back alongside the client because `getUser` needs both, and
// asking for it twice reads as two loads even though it is one memoized promise.
const makeClient = async (redirectUri: string) => {
  const { google } = await loadGoogleApis();
  return {
    google,
    client: new google.auth.OAuth2({
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri,
    }),
  };
};

@AuthProvider({ provider: 'GOOGLE' })
export class GoogleProvider extends AuthProviderAbstract {
  async generateLink(query?: { redirect_uri?: string }) {
    const redirectUri = selectRedirect(query?.redirect_uri);
    const state = await issueOAuthState('GOOGLE', redirectUri);
    const { client } = await makeClient(redirectUri);
    return client.generateAuthUrl({
      access_type: 'online',
      prompt: 'consent',
      state,
      redirect_uri: redirectUri,
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  async getToken(
    code: string,
    redirectUri?: string,
    callback?: AuthCallbackContext
  ) {
    const requestedRedirectUri = redirectUri
      ? selectRedirect(redirectUri)
      : undefined;
    const storedRedirectUri = await consumeOAuthState(
      'GOOGLE',
      requestedRedirectUri,
      callback
    );
    const { client } = await makeClient(storedRedirectUri);
    const { tokens } = await client.getToken(code);
    return tokens.access_token!;
  }

  async getUser(providerToken: string) {
    const { google, client } = await makeClient(defaultRedirect());
    client.setCredentials({ access_token: providerToken });
    const { data } = await google
      .oauth2({ version: 'v2', auth: client })
      .userinfo.get();

    return {
      id: data.id!,
      email: data.email!,
    };
  }
}
