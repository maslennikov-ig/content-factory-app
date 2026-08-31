import {
  AuthProvider,
  AuthProviderAbstract,
} from '@contentfactory/backend/services/auth/providers.interface';
import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import {
  consumeOAuthState,
  issueOAuthState,
} from '@contentfactory/backend/services/auth/providers/oauth.state';

const redirectUri = () => `${process.env.FRONTEND_URL}/settings`;

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  async generateLink(query?: { redirect_uri?: string }): Promise<string> {
    const selectedRedirectUri = query?.redirect_uri || redirectUri();
    if (selectedRedirectUri !== redirectUri()) {
      throw new Error('Invalid GITHUB OAuth redirect URI');
    }
    const state = await issueOAuthState('GITHUB', selectedRedirectUri);
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || '',
      scope: 'user:email',
      redirect_uri: selectedRedirectUri,
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async getToken(
    code: string,
    requestedRedirectUri?: string,
    callback?: AuthCallbackContext
  ): Promise<string> {
    if (requestedRedirectUri && requestedRedirectUri !== redirectUri()) {
      throw new Error('Invalid GITHUB OAuth redirect URI');
    }
    const selectedRedirectUri = await consumeOAuthState(
      'GITHUB',
      requestedRedirectUri,
      callback
    );
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: selectedRedirectUri,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const data = await (
      await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const emails: Array<{
      email: string;
      verified: boolean;
      primary: boolean;
    }> = await (
      await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const selectedEmail =
      emails.find((candidate) => candidate.verified && candidate.primary) ||
      emails.find((candidate) => candidate.verified);
    if (!selectedEmail) {
      throw new Error('GitHub returned no verified email');
    }

    return {
      email: selectedEmail.email,
      id: String(data.id),
    };
  }
}
