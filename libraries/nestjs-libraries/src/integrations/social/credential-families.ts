/**
 * LinkedIn accounts and their pages use one OAuth credential inside a single
 * workspace. Provider-family knowledge lives beside provider implementations;
 * the persistence layer must still scope every propagation by organization.
 * All other providers share only their exact identifier by default.
 */
export function credentialProviderFamily(provider: string): string[] {
  return provider === 'linkedin' || provider === 'linkedin-page'
    ? ['linkedin', 'linkedin-page']
    : [provider];
}
