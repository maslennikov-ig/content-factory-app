import { Injectable } from '@nestjs/common';

/**
 * What came back from the provider redirect, plus what the browser itself
 * carried through the round trip. `state` is public: it travels in the URL and
 * anyone who can read the callback sees it. `browserState` comes from a cookie
 * this backend set when the link was generated, so only the browser that
 * started the flow can present it. A provider that compares the two rejects a
 * login-CSRF, where an attacker completes authentication and then feeds their
 * own `code` and `state` to somebody else's browser.
 */
export interface AuthCallbackContext {
  state?: string;
  browserState?: string;
}

export abstract class AuthProviderAbstract {
  abstract generateLink(query?: any): Promise<string> | string;
  abstract getToken(
    code: string,
    redirectUri?: string,
    callback?: AuthCallbackContext
  ): Promise<string>;
  abstract getUser(
    providerToken: string
  ): Promise<{ email: string; id: string }> | false;
  async postRegistration(
    providerToken: string,
    orgId: string
  ): Promise<void> {}
}

export interface AuthProviderParams {
  provider: string;
}

export function AuthProvider(params: AuthProviderParams) {
  return function (target: any) {
    Injectable()(target);

    const existingMetadata =
      Reflect.getMetadata('auth-provider', AuthProviderAbstract) || [];

    existingMetadata.push({ target, provider: params.provider });

    Reflect.defineMetadata(
      'auth-provider',
      existingMetadata,
      AuthProviderAbstract
    );
  };
}
