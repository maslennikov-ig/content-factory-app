import {
  AuthProvider,
  AuthProviderAbstract,
} from '@contentfactory/backend/services/auth/providers.interface';
import type { NeynarAPIClient } from '@neynar/nodejs-sdk';

// Preserve the existing app-key capture at provider module evaluation.
const clientApiKey =
  process.env.NEYNAR_SECRET_KEY || '00000000-000-0000-000-000000000000';
let clientPromise: Promise<NeynarAPIClient> | undefined;

// Share only app-level SDK/client initialization. A failed initialization
// rejects this operation; only a later independent invocation may try again.
const getClient = (): Promise<NeynarAPIClient> =>
  (clientPromise ??= import('@neynar/nodejs-sdk')
    .then(
      ({ NeynarAPIClient }) => new NeynarAPIClient({ apiKey: clientApiKey })
    )
    .catch((error) => {
      clientPromise = undefined;
      throw error;
    }));

@AuthProvider({ provider: 'FARCASTER' })
export class FarcasterProvider extends AuthProviderAbstract {
  generateLink() {
    return '';
  }

  async getToken(code: string, _redirectUri?: string) {
    const data = JSON.parse(Buffer.from(code, 'base64').toString());
    const client = await getClient();
    const status = await client.lookupSigner({ signerUuid: data.signer_uuid });
    if (status.status === 'approved') {
      return data.signer_uuid;
    }

    return '';
  }

  async getUser(providerToken: string) {
    const client = await getClient();
    const status = await client.lookupSigner({ signerUuid: providerToken });
    if (status.status !== 'approved') {
      return {
        id: '',
        email: '',
      };
    }

    return {
      id: String('farcaster_' + status.fid),
      email: String('farcaster_' + status.fid),
    };
  }
}
