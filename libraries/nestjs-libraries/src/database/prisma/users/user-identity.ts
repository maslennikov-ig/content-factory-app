import { Provider } from '@prisma/client';

export function normalizeIdentityIdentifier(
  provider: Provider,
  providerIdentifier: string
) {
  const value = providerIdentifier.trim();
  return provider === Provider.LOCAL ? value.toLowerCase() : value;
}

export function legacyIdentityIdentifier(user: {
  email: string;
  providerName: Provider;
  providerId: string | null;
}) {
  return normalizeIdentityIdentifier(
    user.providerName,
    user.providerName === Provider.LOCAL ? user.email : user.providerId || ''
  );
}
