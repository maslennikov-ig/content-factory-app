import type { VideoProviderSettingId } from '../videos/video-settings.v1';

/** Transport view of existing connection inventory; does not import server/provider implementations into UI. */
export interface HubPersonalChoicesV1 {
  workspaceEnabled: boolean;
  providers: {provider: VideoProviderSettingId; enabled: boolean; connectReady: boolean; generationReady: boolean; blockers: string[]; trial: boolean}[];
  connections: {id: string; provider: string; state: string; generation: number; unit: string | null; perJob: string | null; perMonth: string | null;
    walletVerified: boolean; workspaceGranted: boolean; balance: null}[];
}
export interface HubProviderV1 {
  identifier: string; title: string; description: string;
  api: { legacyAvailable: boolean; videoAvailable: boolean; connections: { id: string; name: string }[] };
  personal: boolean;
}
export interface ThirdPartyHubV1 { providers: HubProviderV1[]; video: HubPersonalChoicesV1 }

/** Projection of existing inventories only: no registry, credentials, discovery or execution. */
export function thirdPartyHubV1(catalog: {identifier: string; title: string; description: string}[],
  saved: {id: string; name: string; identifier: string}[], choices: HubPersonalChoicesV1, apiProviders: readonly string[]): ThirdPartyHubV1 {
  const identifiers = [...new Set([...catalog.map(p => p.identifier), ...apiProviders, ...choices.providers.map(p => p.provider)])];
  return {
    providers: identifiers.map(identifier => {
      const descriptor = catalog.find(p => p.identifier === identifier);
      return { identifier, title: descriptor?.title ?? identifier.charAt(0).toUpperCase() + identifier.slice(1), description: descriptor?.description ?? '',
        api: { legacyAvailable: !!descriptor, videoAvailable: apiProviders.includes(identifier),
          connections: saved.filter(row => row.identifier === identifier).map(row => ({id: row.id, name: row.name})) },
        personal: choices.providers.some(p => p.provider === identifier) };
    }),
    // Whitelist here as well as in the existing service: future fields cannot expose tokens/identity.
    video: { workspaceEnabled: choices.workspaceEnabled,
      providers: choices.providers.map(p => ({provider: p.provider, enabled: p.enabled, connectReady: p.connectReady,
        generationReady: p.generationReady, blockers: [...p.blockers], trial: p.trial})),
      connections: choices.connections.map(c => ({id: c.id, provider: c.provider, state: c.state, generation: c.generation, unit: c.unit,
        perJob: c.perJob, perMonth: c.perMonth, walletVerified: c.walletVerified, workspaceGranted: c.workspaceGranted, balance: null})) },
  };
}
