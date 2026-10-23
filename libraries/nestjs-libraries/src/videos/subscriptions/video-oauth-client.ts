import { Injectable } from '@nestjs/common';
import { startAuthorization, exchangeAuthorization, refreshAuthorization, registerClient } from '@modelcontextprotocol/sdk/client/auth.js';
import { VideoSubscriptionRuntime, SubscriptionEndpoint } from './video-provider-registry';
import { videoErrorV1 } from '../video-brief.v1';

@Injectable()
export class VideoOAuthClient {
  constructor(private readonly runtime: VideoSubscriptionRuntime) {}
  private fetcher(def: SubscriptionEndpoint) { return (url: string | URL, init?: RequestInit) => this.runtime.fetch(def, url, init); }
  async metadata(def: SubscriptionEndpoint): Promise<any> {
    const resourceResponse = await this.runtime.fetch(def, def.resourceMetadata);
    const resource = await resourceResponse.json();
    if (!resourceResponse.ok || resource.resource !== def.resource || !Array.isArray(resource.authorization_servers) || !resource.authorization_servers.includes(def.issuer)) return videoErrorV1('VIDEO_OAUTH_METADATA_INVALID');
    const response = await this.runtime.fetch(def, `${def.issuer}/.well-known/oauth-authorization-server`);
    const metadata = await response.json();
    if (!response.ok || metadata.issuer !== def.issuer || !metadata.code_challenge_methods_supported?.includes('S256')) return videoErrorV1('VIDEO_OAUTH_METADATA_INVALID');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'revocation_endpoint']) {
      if (metadata[key]) await this.runtime.validateUrl(def, metadata[key]);
    }
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) return videoErrorV1('VIDEO_OAUTH_METADATA_INVALID');
    return metadata;
  }
  async registration(def: SubscriptionEndpoint, metadata: any, redirect: string) {
    if (!metadata.registration_endpoint) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
    return registerClient(def.issuer, {metadata, clientMetadata: {
      client_name: 'Content Factory', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'none',
    }, fetchFn: this.fetcher(def)});
  }
  authorize(def: SubscriptionEndpoint, metadata: any, client: any, redirect: string, state: string) {
    return startAuthorization(def.issuer, {metadata, clientInformation: client, redirectUrl: redirect, state, resource: def.resource});
  }
  exchange(def: SubscriptionEndpoint, metadata: any, client: any, redirect: string, code: string, verifier: string) {
    return exchangeAuthorization(def.issuer, {metadata, clientInformation: client, redirectUri: redirect,
      authorizationCode: code, codeVerifier: verifier, resource: new URL(def.resource), fetchFn: this.fetcher(def)});
  }
  refresh(def: SubscriptionEndpoint, metadata: any, client: any, token: string) {
    return refreshAuthorization(def.issuer, {metadata, clientInformation: client, refreshToken: token, resource: new URL(def.resource), fetchFn: this.fetcher(def)});
  }
  async identity(def: SubscriptionEndpoint, token: string): Promise<string> {
    // A decoded JWT or an email is never accepted as wallet identity.
    if (!def.identityEndpoint) return videoErrorV1('VIDEO_WALLET_IDENTITY_UNVERIFIED', 409);
    const response = await this.runtime.fetch(def, def.identityEndpoint, {headers: {Authorization: `Bearer ${token}`}});
    const value = await response.json();
    if (!response.ok || value.iss !== def.issuer || typeof value.sub !== 'string' || !value.sub || value.sub.length > 512) return videoErrorV1('VIDEO_WALLET_IDENTITY_UNVERIFIED', 409);
    return value.sub;
  }
}
