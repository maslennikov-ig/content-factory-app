import { HttpException, Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { VideoSubscriptionRuntime, SubscriptionEndpoint, subscriptionHash, VideoQualificationResponseError, type VideoQualificationPhase } from './video-provider-registry';
import { videoErrorV1 } from '../video-brief.v1';
import { HGG_READ_SCHEMA_V1, hggReadPlanV1, hggReadRequestV1, decodeHggReadV1, type HggReadHooksV1 } from './video-hgg-qualification-read.v1';
import { hggPilotQuoteRequestV1, decodeHggPilotQuoteV1, type HggPilotQuoteOwnerV1, type HggPilotEvidenceBytesV1, type HggPilotQuoteHooksV1 } from './video-hgg-pilot-quote.v1';
import { HGG_PILOT_EVIDENCE_V1 } from './video-hgg-pilot-evidence.v1';
import { hggPilotWireV1, hggPrivateWorkspaceV1, type HggPilotExchangeV1, type HggPilotExchangeHooksV1 } from './video-hgg-pilot-wire.v1';
import { HEYGEN_OWNED_CATALOG_SCHEMA_V1, HEYGEN_OWNED_CATALOG_READS_V1, HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1, heygenCatalogPageV1, decodeHeygenOwnedCatalogV1, heygenOwnedAvatarGroupInputV1, selectHeygenOwnedAvatarV1, decodeHeygenOwnedAvatarGroupV1, type HeygenCatalogKindV1 } from './video-heygen-owned-catalog.v1';
import { HEYGEN_AVATAR_CONSENT_ISSUE_SCHEMA_V1, heygenOwnedConsentIssueInputV1, heygenConsentIssueDecisionV1, heygenConsentFailureReasonV1, type HeygenConsentIssueResultV1 } from './video-heygen-consent-issue.v1';
import { decodeHeygenConsentLinkV1 } from './video-heygen-consent-link.v1';
import { HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1, heygenAvatarWireArgsV1, decodeHeygenAccountV1, decodeHeygenAvatarReceiptV1, decodeHeygenVideoV1,
  type HeygenAvatarHooksV1 } from './video-heygen-avatar-native.v1';
import { HEYGEN_SETTINGS_TOOL_SCHEMAS_V2, heygenAvatarWireArgsV2 } from './video-heygen-settings.v2';
import { HEYGEN_CREATIVE_TOOL_SCHEMAS_V1, heygenCreativeMutationV1, heygenCreativeReadV1, heygenCreativeEnvelopeV1 } from './video-heygen-creative-native.v1';
import {
  HEYGEN_ADVANCED_TOOL_SCHEMAS_V1, HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2,
  decodeHeygenAdvancedPageV1, decodeHeygenAdvancedVoiceQualificationV1, decodeHeygenBackgroundAssetReferenceV1,
  decodeHeygenMattingQualificationV1, decodeHeygenOwnedAssetQualificationV1, decodeHeygenOwnedGlossaryQualificationV1,
  listHeygenAdvancedOwnedAssetsV1, listHeygenAdvancedOwnedGlossariesV1, parseHeygenAdvancedOptionsInputV1,
  selectHeygenAdvancedOwnedLookV1, selectHeygenAdvancedPrivateVoiceV1,
  type HeygenAdvancedBrowseCategoryV1, type HeygenAdvancedOptionsInputV1, type HeygenAdvancedOptionsV1, type HeygenBackgroundAssetReferenceV1,
} from './video-heygen-advanced-qualification.v1';

const tools = {higgsfield: ['generate_clip', 'jobs_wait'], heygen: ['create_video', 'get_video', 'quote_video', 'list_avatars', 'list_voices']} as const;
export type VideoTokenGuard = () => Promise<void>;
type OperatorScope = {request?: {tool: string; arguments: object}; phase: 'qualification/read' | 'qualification/quote' | 'pilot/workspace' | 'pilot/submit' | 'pilot/poll' | 'consent/issue'; onBeforeDispatch?: () => Promise<void>; dispatched?: boolean; encryptedConsentResponse?: string;
  mutation?: true; afterResponse?: HeygenAvatarHooksV1['afterResponse']; responseCaptured?: boolean};

@Injectable()
export class VideoMcpClient {
  constructor(private readonly runtime: VideoSubscriptionRuntime) {}
  private async session<T>(def: SubscriptionEndpoint, token: string, run: (client: Client) => Promise<T>, assertUsable?: VideoTokenGuard, qualification = false, readScope?: OperatorScope): Promise<T> {
    let endpoint: URL;
    try {
      endpoint = new URL(def.transportEndpoint ?? def.resource);
      if (def.transportEndpoint !== undefined && (typeof def.transportEndpoint !== 'string' ||
        endpoint.origin !== new URL(def.resource).origin || !def.origins.includes(endpoint.origin) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash)) throw new Error();
    } catch { return videoErrorV1('VIDEO_ENDPOINT_UNSAFE'); }
    const finite = qualification || !!readScope;
    const controller = finite ? new AbortController() : undefined;
    let phase: VideoQualificationPhase = 'initialize'; let timer: ReturnType<typeof setTimeout> | undefined;
    const smallResponse = () => phase === 'qualification/read' || phase === 'qualification/quote' || phase.startsWith('pilot/') || phase === 'consent/issue';
    const deadline = finite ? new Promise<never>((_, reject) => {timer = setTimeout(() => {
      reject(new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', phase, 0, smallResponse())); controller!.abort();
    }, readScope ? 180_000 : 45_000);}) : undefined;
    const client = new Client({name: 'Content Factory', version: '1.0.0'}, {capabilities: {}});
    const transport = new StreamableHTTPClientTransport(endpoint, {
      // No authProvider: SDK cannot refresh/replay a billable mutation after 401.
      requestInit: {headers: {Authorization: `Bearer ${token}`}},
      reconnectionOptions: {maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1},
      // A session can send several requests. Fence each new send, including
      // initialization and tool discovery, after any previous request finishes.
      fetch: async (url, init) => {
        await assertUsable?.();
        if (!finite) return this.runtime.fetch(def, String(url), init);
        if (controller!.signal.aborted) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', phase, 0, smallResponse());
        // The SDK optionally opens a background GET event stream after its
        // initialized notification. This finite operator session needs no stream.
        if (init?.method === 'GET') return new Response(null, {status: 405});
        if (init?.method === 'DELETE') phase = 'close';
        else {
          let rpc: any;
          try { rpc = JSON.parse(typeof init?.body === 'string' ? init.body : ''); } catch { /* Refuse unknown/batched protocol traffic. */ }
          if (init?.method !== 'POST') return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
          if (rpc?.method === 'tools/call' && readScope?.request && rpc.params?.name === readScope.request.tool &&
            subscriptionHash(rpc.params.arguments) === subscriptionHash(readScope.request.arguments)) {
            phase = readScope.phase; readScope.request = undefined;
            if (phase === 'consent/issue' || readScope.mutation) {
              const before = readScope.onBeforeDispatch; readScope.onBeforeDispatch = undefined;
              if (typeof before !== 'function' || readScope.dispatched) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
              await before(); await assertUsable?.();
              if (controller!.signal.aborted) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', phase, 0, true);
              readScope.dispatched = true;
            }
          }
          else if (['initialize', 'notifications/initialized', 'tools/list'].includes(rpc?.method)) phase = rpc.method;
          else return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        }
        const response = await this.runtime.fetch(def, String(url), init, {phase, signal: controller!.signal, ...(smallResponse() ? {read: true as const} : {})});
        if (phase === 'pilot/submit' && readScope?.mutation && readScope.dispatched && !readScope.responseCaptured && readScope.afterResponse) {
          // The bounded body is durable before SDK parsing or another token guard.
          // A malformed response still belongs to the one dispatched attempt.
          await readScope.afterResponse({kind: 'http', status: response.status, body: await response.clone().text()});
          readScope.responseCaptured = true;
        }
        if (phase === 'consent/issue' && readScope?.dispatched) {
          // Capture the bounded provider body before SDK decoding; it can contain
          // the one-use link, so it is encrypted and never written to logs.
          try { this.captureConsentResponse(readScope, {kind: 'http', status: response.status, body: await response.clone().text()}); } catch { /* best effort */ }
        }
        return response;
      },
    });
    try {
      const operation = async () => {await client.connect(transport, {timeout: finite ? 45_000 : 20_000}); return run(client);};
      return await (deadline ? Promise.race([operation(), deadline]) : operation());
    }
    catch (error: any) {
      if (finite && error instanceof VideoQualificationResponseError) throw error;
      const code = error?.getResponse?.()?.code;
      // The SDK may include remote text in an exception. Do not pass it to HTTP, tracing or chat.
      return videoErrorV1(typeof code === 'string' && /^VIDEO_[A-Z0-9_]{1,70}$/.test(code) ? code : 'VIDEO_MCP_UNAVAILABLE', 409);
    }
    finally {
      phase = 'close';
      try {const closing = client.close().catch(() => {}); await (deadline ? Promise.race([closing, deadline]) : closing);}
      finally {if (timer) clearTimeout(timer); controller?.abort();}
    }
  }
  /** tools/list only. Unreviewed output never authorizes tools/call. */
  async discover(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    return this.discoverSchema(def, token, assertUsable);
  }
  /** Larger finite response budget only for the explicit private operator export. */
  async discoverQualification(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    return this.discoverSchema(def, token, assertUsable, true);
  }
  private assertHeygenNativeEndpointV1(def: SubscriptionEndpoint, guard: VideoTokenGuard) {
    const configured = this.runtime.definition('heygen');
    if (def.provider !== 'heygen' || def.resource !== configured.resource || def.issuer !== configured.issuer ||
      def.transportEndpoint !== configured.transportEndpoint || def.ownedAssetReadProfile !== 'heygen_private_catalog_v1' ||
      typeof guard !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
  }
  private async heygenNativeSchemaV1(def: SubscriptionEndpoint, client: Client, name: keyof typeof HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1) {
    const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
    const names = name === 'get_current_user' ? Object.keys(HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1) as Array<keyof typeof HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1> : [name];
    if (new Set(observed.inventory.map(tool => tool.name)).size !== observed.inventory.length || names.some(selectedName => {
      const selected = observed.inventory.filter(tool => tool.name === selectedName);
      return selected.length !== 1 || subscriptionHash(selected[0]) !== HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1[selectedName];
    })) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
  }
  /** Authenticated subscription funding, separate from generic wallet qualification. */
  async readHeygenAccountV1(def: SubscriptionEndpoint, token: string, guard: VideoTokenGuard) {
    this.assertHeygenNativeEndpointV1(def, guard);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      await this.heygenNativeSchemaV1(def, client, 'get_current_user');
      const raw = await this.scopedHeygenCall(client, scope, {tool: 'get_current_user', arguments: {}}, guard);
      return decodeHeygenAccountV1(raw, def.issuer);
    }, guard, false, scope);
  }
  /** Account-bound private reads only. No generic tool, provider URL, or caller observation enters the transport. */
  async readHeygenAdvancedOptionsV1(def: SubscriptionEndpoint, token: string, input: HeygenAdvancedOptionsInputV1,
    guard: VideoTokenGuard, consumeBackground?: (image: HeygenBackgroundAssetReferenceV1) => Promise<void>): Promise<HeygenAdvancedOptionsV1> {
    this.assertHeygenNativeEndpointV1(def, guard);
    const selected = parseHeygenAdvancedOptionsInputV1(input);
    const scope: OperatorScope = {phase: 'qualification/read'};
    let selectedBackground: HeygenBackgroundAssetReferenceV1 | undefined;
    const options = await this.session(def, token, async client => {
      const pin = HEYGEN_ADVANCED_TOOL_SCHEMAS_V1;
      const pins = {
        get_current_user: HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1.get_current_user,
        ...(selected.voiceId ? {list_voices: pin.list_voices, get_voice: pin.get_voice} : {}),
        ...(selected.appearance ? {list_avatar_looks: pin.list_avatar_looks, get_avatar_look: pin.get_avatar_look} : {}),
        ...(selected.includeGlossaries || selected.glossaryId ? {list_brand_glossaries: pin.list_brand_glossaries} : {}),
        ...(selected.glossaryId ? {get_brand_glossary: pin.get_brand_glossary} : {}),
        ...(selected.includeAssets || selected.backgroundAssetId || selected.audioAssetId ? {list_assets: pin.list_assets} : {}),
        ...(selected.backgroundAssetId || selected.audioAssetId ? {get_asset: pin.get_asset} : {}),
      };
      const {inventory} = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (new Set(inventory.map(tool => tool.name)).size !== inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      type PinnedTool = keyof typeof pins;
      const assertPinned = (names: readonly PinnedTool[]) => {
        for (const name of names) {
          const schema = inventory.find(tool => tool.name === name);
          if (!schema || !pins[name]) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
          const actual = subscriptionHash(schema);
          if (actual !== pins[name] && !(name === 'list_voices' && actual === HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2))
            return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
        }
      };
      assertPinned(selected.browse ? ['get_current_user'] : Object.keys(pins) as PinnedTool[]);
      const read = (tool: keyof typeof pins, args: Record<string, unknown>) =>
        this.scopedHeygenCall(client, scope, {tool, arguments: args}, guard);
      const account = await read('get_current_user', {});
      if (decodeHeygenAccountV1(account, def.issuer).subjectDigest !== selected.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      const options: HeygenAdvancedOptionsV1 = {};
      const qualify = async (category: HeygenAdvancedBrowseCategoryV1, names: readonly PinnedTool[], observe: () => Promise<void>) => {
        try {
          if (selected.browse) assertPinned(names);
          await observe();
        } catch (error: any) {
          const code = error?.getResponse?.()?.code;
          if (!selected.browse || ['VIDEO_ACCESS_DENIED', 'VIDEO_CONNECTION_CHANGED', 'VIDEO_REAUTH_REQUIRED',
            'VIDEO_CONNECTION_UNAVAILABLE'].includes(code)) throw error;
          (options.unavailable ??= []).push(category);
        }
      };
      const voiceId = selected.voiceId;
      if (voiceId) await qualify('voice', ['list_voices', 'get_voice'], async () => {
        const schema = inventory.find(tool => tool.name === 'list_voices')!;
        const currentPrivateList = subscriptionHash(schema) === HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2;
        const privateVoiceRows = await this.readHeygenAdvancedPagesV1(read, 'list_voices', {type: 'private'}, 100);
        selectHeygenAdvancedPrivateVoiceV1(privateVoiceRows, voiceId, currentPrivateList);
        const detail = await read('get_voice', {voiceId});
        options.voice = decodeHeygenAdvancedVoiceQualificationV1({voiceId, privateVoiceRows, detail, currentPrivateList});
      });
      if (selected.includeGlossaries || selected.glossaryId) await qualify('glossaries', ['list_brand_glossaries'], async () => {
        const workspaceGlossaryRows = await this.readHeygenAdvancedPagesV1(read, 'list_brand_glossaries', {}, 100);
        const glossaries = listHeygenAdvancedOwnedGlossariesV1(workspaceGlossaryRows);
        if (selected.includeGlossaries) options.glossaries = glossaries;
        if (selected.glossaryId) {
          if (!glossaries.some(glossary => glossary.id === selected.glossaryId)) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
          const detail = await read('get_brand_glossary', {brandGlossaryId: selected.glossaryId});
          options.glossary = decodeHeygenOwnedGlossaryQualificationV1({glossaryId: selected.glossaryId, workspaceGlossaryRows, detail});
        }
      });
      if (selected.includeAssets || selected.backgroundAssetId || selected.audioAssetId) await qualify('assets', ['list_assets'], async () => {
        const accountUsername: string = account.username;
        const privateAssetRows = await this.readHeygenAdvancedPagesV1(read, 'list_assets', {username: accountUsername}, 100);
        const assets = listHeygenAdvancedOwnedAssetsV1(privateAssetRows, accountUsername);
        if (selected.includeAssets) options.assets = assets;
        for (const [key, assetId, type] of [
          ['backgroundAsset', selected.backgroundAssetId, 'image'], ['audioAsset', selected.audioAssetId, 'audio'],
        ] as const) {
          if (!assetId) continue;
          if (!assets.some(asset => asset.id === assetId && asset.type === type)) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
          const detail = await read('get_asset', {assetId}).catch(error => {
            if (key === 'backgroundAsset' && error?.getResponse?.()?.code === 'VIDEO_PROVIDER_TOOL_ERROR')
              return videoErrorV1('VIDEO_HEYGEN_BACKGROUND_DOWNLOAD_UNAVAILABLE', 409);
            throw error;
          });
          options[key] = decodeHeygenOwnedAssetQualificationV1({assetId, accountUsername, privateAssetRows, detail});
          if (key === 'backgroundAsset' && consumeBackground) selectedBackground = decodeHeygenBackgroundAssetReferenceV1(assetId, detail);
        }
      });
      const appearance = selected.appearance;
      if (appearance) await qualify('matting', ['list_avatar_looks', 'get_avatar_look'], async () => {
        const {lookId, groupId} = appearance;
        const ownedLookRows = await this.readHeygenAdvancedPagesV1(read, 'list_avatar_looks', {ownership: 'private', groupId}, 50);
        selectHeygenAdvancedOwnedLookV1(ownedLookRows, lookId, groupId);
        const detail = await read('get_avatar_look', {lookId});
        options.matting = decodeHeygenMattingQualificationV1({lookId, groupId, ownedLookRows, detail});
      });
      await guard();
      return options;
    }, guard, false, scope);
    if (selectedBackground && consumeBackground) {
      await guard();
      await consumeBackground(selectedBackground);
      await guard();
    }
    return options;
  }

  private async readHeygenAdvancedPagesV1(
    read: (tool: 'list_voices' | 'list_brand_glossaries' | 'list_assets' | 'list_avatar_looks',
      args: Record<string, unknown>) => Promise<Record<string, unknown>>,
    tool: 'list_voices' | 'list_brand_glossaries' | 'list_assets' | 'list_avatar_looks',
    args: Record<string, unknown>,
    limit: number,
  ) {
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let index = 0; index < 3; index++) {
      const page = decodeHeygenAdvancedPageV1(await read(tool, {...args, limit, ...(cursor ? {token: cursor} : {})}), limit);
      rows.push(...page.items);
      if (!page.has_more) return rows;
      cursor = page.next_token!;
      if (seen.has(cursor)) return videoErrorV1('VIDEO_CATALOG_INCOMPLETE', 409);
      seen.add(cursor);
    }
    return videoErrorV1('VIDEO_CATALOG_INCOMPLETE', 409);
  }
  /** Fixed creative schemas only. An advertised schema never establishes entitlement. */
  async readHeygenCreativeSchemasV1(def: SubscriptionEndpoint, token: string, kind: 'style' | 'voice', guard: VideoTokenGuard) {
    this.assertHeygenNativeEndpointV1(def, guard);
    if (!['style', 'voice'].includes(kind)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      const names = kind === 'style' ? ['create_prompt_avatar', 'get_avatar_creation_status', 'get_avatar_look'] as const : ['clone_voice', 'create_speech', 'get_voice'] as const;
      await this.heygenCreativeSchemasInSessionV1(def, client, names);
      await guard();
      return Object.fromEntries(names.map(name => [name, HEYGEN_CREATIVE_TOOL_SCHEMAS_V1[name]]));
    }, guard, false, scope);
  }
  private async heygenCreativeSchemasInSessionV1(def: SubscriptionEndpoint, client: Client, names: readonly (keyof typeof HEYGEN_CREATIVE_TOOL_SCHEMAS_V1)[]) {
    const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
    if (new Set(observed.inventory.map(tool => tool.name)).size !== observed.inventory.length || names.some(name => {
      const selected = observed.inventory.filter(tool => tool.name === name);
      return selected.length !== 1 || subscriptionHash(selected[0]) !== HEYGEN_CREATIVE_TOOL_SCHEMAS_V1[name];
    })) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
  }
  /** No caller-selected tool names or argument bags outside the strict three-read union. */
  async readHeygenCreativeV1(def: SubscriptionEndpoint, token: string, input: unknown, guard: VideoTokenGuard) {
    this.assertHeygenNativeEndpointV1(def, guard);
    const request = heygenCreativeReadV1(input), scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      await this.heygenCreativeSchemasInSessionV1(def, client, [request.tool]);
      return this.scopedHeygenCall(client, scope, {tool: request.tool!, arguments: request.arguments!}, guard);
    }, guard, false, scope);
  }
  /** Exactly one physical mutation, durable before-send marker and raw response before parsing. */
  async mutateHeygenCreativeV1(def: SubscriptionEndpoint, token: string, input: unknown, guard: VideoTokenGuard, hooks: HeygenAvatarHooksV1): Promise<Record<string, unknown>> {
    this.assertHeygenNativeEndpointV1(def, guard);
    const request = heygenCreativeMutationV1(input);
    if (typeof hooks?.beforeDispatch !== 'function' || typeof hooks?.afterResponse !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read', mutation: true, afterResponse: hooks.afterResponse};
    return this.session(def, token, async client => {
      await this.heygenCreativeSchemasInSessionV1(def, client, [request.tool]);
      await guard(); scope.phase = 'pilot/submit'; scope.onBeforeDispatch = hooks.beforeDispatch; scope.request = {tool: request.tool!, arguments: request.arguments!};
      const response = await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000});
      scope.request = undefined;
      if (!scope.responseCaptured) {await hooks.afterResponse(response as Record<string, unknown>); scope.responseCaptured = true;}
      heygenCreativeEnvelopeV1(response);
      await guard();
      return response as Record<string, unknown>;
    }, guard, false, scope);
  }
  /** One frozen Avatar IV mutation. The transport owns the durable dispatch boundary. */
  async renderHeygenAvatarV1(def: SubscriptionEndpoint, token: string, args: unknown, guard: VideoTokenGuard, hooks: HeygenAvatarHooksV1) {
    this.assertHeygenNativeEndpointV1(def, guard);
    const wire = heygenAvatarWireArgsV1(args);
    if (typeof hooks?.beforeDispatch !== 'function' || typeof hooks?.afterResponse !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read', mutation: true, afterResponse: hooks.afterResponse};
    return this.session(def, token, async client => {
      await this.heygenNativeSchemaV1(def, client, 'create_video_from_avatar');
      await guard();
      scope.phase = 'pilot/submit'; scope.onBeforeDispatch = hooks.beforeDispatch;
      scope.request = {tool: 'create_video_from_avatar', arguments: wire};
      const response = await client.callTool({name: 'create_video_from_avatar', arguments: wire}, undefined, {timeout: 45_000});
      scope.request = undefined;
      // Unit transports may return the MCP envelope without using HTTP fetch.
      if (!scope.responseCaptured) {await hooks.afterResponse(response as Record<string, unknown>); scope.responseCaptured = true;}
      const receipt = decodeHeygenAvatarReceiptV1(response);
      await guard();
      return receipt;
    }, guard, false, scope);
  }
  /** Additive settings route. Existing V1 jobs keep their original parser and wire. */
  async renderHeygenAvatarV2(def: SubscriptionEndpoint, token: string, args: unknown, guard: VideoTokenGuard, hooks: HeygenAvatarHooksV1) {
    this.assertHeygenNativeEndpointV1(def, guard);
    const wire = heygenAvatarWireArgsV2(args);
    if (typeof hooks?.beforeDispatch !== 'function' || typeof hooks?.afterResponse !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read', mutation: true, afterResponse: hooks.afterResponse};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      const create = observed.inventory.filter(tool => tool.name === 'create_video_from_avatar');
      if (new Set(observed.inventory.map(tool => tool.name)).size !== observed.inventory.length || create.length !== 1 ||
        subscriptionHash(create[0]) !== HEYGEN_SETTINGS_TOOL_SCHEMAS_V2.create_video_from_avatar) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      await guard();
      scope.phase = 'pilot/submit'; scope.onBeforeDispatch = hooks.beforeDispatch;
      scope.request = {tool: 'create_video_from_avatar', arguments: wire};
      const response = await client.callTool({name: 'create_video_from_avatar', arguments: wire}, undefined, {timeout: 45_000});
      scope.request = undefined;
      if (!scope.responseCaptured) {await hooks.afterResponse(response as Record<string, unknown>); scope.responseCaptured = true;}
      const receipt = decodeHeygenAvatarReceiptV1(response);
      await guard();
      return receipt;
    }, guard, false, scope);
  }
  /** Poll the existing explicit provider ID; this profile has no create fallback. */
  async readHeygenVideoV1(def: SubscriptionEndpoint, token: string, id: string, guard: VideoTokenGuard) {
    this.assertHeygenNativeEndpointV1(def, guard);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      await this.heygenNativeSchemaV1(def, client, 'get_video');
      const raw = await this.scopedHeygenCall(client, scope, {tool: 'get_video', arguments: {videoId: id}}, guard);
      return decodeHeygenVideoV1(raw, id);
    }, guard, false, scope);
  }
  /** Private account inventory only. This does not use or enable a priced tool profile. */
  async readHeygenOwnedCatalog(def: SubscriptionEndpoint, token: string, assertUsable: VideoTokenGuard) {
    const configured = this.runtime.definition('heygen');
    if (def.provider !== 'heygen' || def.resource !== configured.resource || def.issuer !== configured.issuer ||
      def.ownedAssetReadProfile !== 'heygen_private_catalog_v1' || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      const readNames = new Set<string>(HEYGEN_OWNED_CATALOG_READS_V1.map(read => read.tool));
      const readSchemas = observed.inventory.filter(tool => readNames.has(tool.name));
      const currentPins = {
        list_avatar_groups: HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1.list_avatar_groups,
        list_avatar_looks: HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1.list_avatar_looks,
        list_voices: HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2,
      };
      const current = readSchemas.every(tool => subscriptionHash(tool) === currentPins[tool.name as keyof typeof currentPins]);
      if (readSchemas.length !== readNames.size || new Set(observed.inventory.map(tool => tool.name)).size !== observed.inventory.length ||
        subscriptionHash(readSchemas) !== HEYGEN_OWNED_CATALOG_SCHEMA_V1 && !current)
        return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const collected = {groups: [], looks: [], voices: []} as Record<HeygenCatalogKindV1, Record<string, unknown>[]>;
      for (const read of HEYGEN_OWNED_CATALOG_READS_V1) {
        if (!observed.inventory.some(tool => tool.name === read.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (let index = 0; index < 3; index++) {
          const request = {tool: read.tool, arguments: {...read.arguments, ...(cursor ? {token: cursor} : {})}};
          await assertUsable(); scope.request = request;
          const value = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000}));
          scope.request = undefined; await assertUsable();
          const page = heygenCatalogPageV1(value);
          collected[read.kind].push(...page.data);
          if (!page.has_more) break;
          if (index === 2 || seen.has(page.next_token!)) return videoErrorV1('VIDEO_CATALOG_INCOMPLETE', 409);
          cursor = page.next_token!; seen.add(cursor);
        }
      }
      await assertUsable();
      return decodeHeygenOwnedCatalogV1(collected);
    }, assertUsable, false, scope);
  }
  /** Selected owned-group status only. This profile has no consent creation, pricing or generation tool. */
  async readHeygenOwnedAvatarGroup(def: SubscriptionEndpoint, token: string, input: {avatarId: string; groupId?: string}, assertUsable: VideoTokenGuard) {
    const selected = heygenOwnedAvatarGroupInputV1(input), configured = this.runtime.definition('heygen');
    if (def.provider !== 'heygen' || def.resource !== configured.resource || def.issuer !== configured.issuer ||
      def.ownedAssetReadProfile !== 'heygen_private_catalog_v1' || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, client => this.readHeygenOwnedGroupInSession(def, client, scope, selected, assertUsable), assertUsable, false, scope);
  }
  /** One consent link attempt, only after the caller reserved a durable group-scoped intent. */
  async requestOwnedAvatarConsent(def: SubscriptionEndpoint, token: string, input: {avatarId: string; groupId: string}, assertUsable: VideoTokenGuard, onBeforeDispatch: () => Promise<void>): Promise<HeygenConsentIssueResultV1> {
    const selected = heygenOwnedConsentIssueInputV1(input), configured = this.runtime.definition('heygen');
    if (def.provider !== 'heygen' || def.resource !== configured.resource || def.issuer !== configured.issuer ||
      def.ownedAssetReadProfile !== 'heygen_private_catalog_v1' || typeof assertUsable !== 'function' || typeof onBeforeDispatch !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read'};
    try {
      return await this.session(def, token, async client => {
        const current = await this.readHeygenOwnedGroupInSession(def, client, scope, selected, assertUsable, true);
        const noIssue = heygenConsentIssueDecisionV1(current);
        if (noIssue) return noIssue;
        scope.phase = 'consent/issue'; scope.onBeforeDispatch = onBeforeDispatch;
        const raw = await this.scopedHeygenCall(client, scope, {tool: 'create_avatar_consent', arguments: {groupId: current.groupId}}, assertUsable);
        const link = decodeHeygenConsentLinkV1(raw, current.groupId);
        return {kind: 'issued' as const, avatarId: current.avatarId, groupId: link.groupId, consentUrl: link.url};
      }, assertUsable, false, scope);
    } catch (error) {
      // A receipt/parse/guard failure after a send never proves that HeyGen did
      // not create a one-use URL. Neither the SDK nor the caller may replay it.
      if (scope.dispatched) {
        const failure = new HttpException({code: 'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN', reason: heygenConsentFailureReasonV1(error)}, 409);
        if (scope.encryptedConsentResponse) Object.defineProperty(failure, 'encryptedProviderResponse', {value: scope.encryptedConsentResponse});
        throw failure;
      }
      throw error;
    }
  }
  private captureConsentResponse(scope: OperatorScope, value: unknown) {
    try {
      const serialized = JSON.stringify(value);
      if (typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= 1024 * 1024)
        scope.encryptedConsentResponse = AuthService.fixedEncryption(serialized);
    } catch { /* An unavailable diagnostic must not change the provider result. */ }
  }
  private async scopedHeygenCall(client: Client, scope: OperatorScope, request: {tool: string; arguments: Record<string, unknown>}, assertUsable: VideoTokenGuard) {
    await assertUsable(); scope.request = request;
    const response = await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000});
    if (scope.dispatched && request.tool === 'create_avatar_consent') {
      // A response can contain a one-use URL. Encrypt it before interpretation so
      // an unexpected provider shape can be recovered without another call.
      this.captureConsentResponse(scope, {kind: 'mcp', result: response});
    }
    const value = this.toolValue(response);
    scope.request = undefined; await assertUsable(); return value;
  }
  private async readHeygenOwnedGroupInSession(def: SubscriptionEndpoint, client: Client, scope: OperatorScope, selected: {avatarId: string; groupId?: string}, assertUsable: VideoTokenGuard, forIssuance = false) {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      const pins = {...HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1, ...(forIssuance ? {create_avatar_consent: HEYGEN_AVATAR_CONSENT_ISSUE_SCHEMA_V1} : {})};
      if (new Set(observed.inventory.map(tool => tool.name)).size !== observed.inventory.length ||
        Object.entries(pins).some(([name, digest]) => {
          const schema = observed.inventory.find(tool => tool.name === name);
          return !schema || subscriptionHash(schema) !== digest;
        })) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const collected: {groups: Record<string, unknown>[]; looks: Record<string, unknown>[]} = {groups: [], looks: []};
      for (const read of HEYGEN_OWNED_CATALOG_READS_V1) {
        if (read.kind === 'voices') continue;
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (let index = 0; index < 3; index++) {
          const page = heygenCatalogPageV1(await this.scopedHeygenCall(client, scope, {tool: read.tool, arguments: {...read.arguments, ...(cursor ? {token: cursor} : {})}}, assertUsable));
          collected[read.kind].push(...page.data);
          if (!page.has_more) break;
          if (index === 2 || seen.has(page.next_token!)) return videoErrorV1('VIDEO_CATALOG_INCOMPLETE', 409);
          cursor = page.next_token!; seen.add(cursor);
        }
      }
      const owned = selectHeygenOwnedAvatarV1(collected, selected);
      const detail = await this.scopedHeygenCall(client, scope, {tool: 'get_avatar_group', arguments: {groupId: owned.group.id}}, assertUsable);
      return decodeHeygenOwnedAvatarGroupV1(owned, detail);
  }
  private async discoverSchema(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard, qualification = false) {
    return this.session(def, token, async client => {
      const result = await client.listTools({}, {timeout: qualification ? 45_000 : 20_000});
      return this.inventory(def, result, qualification);
    }, assertUsable, qualification);
  }
  private inventory(def: SubscriptionEndpoint, result: {tools: Array<{name: string; inputSchema: any; outputSchema?: any}>; nextCursor?: string}, qualification = false) {
      if (result.nextCursor || result.tools.length > 200) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
      if (qualification) {
        const pending: Array<{value: unknown; depth: number}> = [{value: result.tools, depth: 0}];
        while (pending.length) {
          const {value, depth} = pending.pop()!;
          if (depth > 64) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
          if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push({value: child, depth: depth + 1});
        }
      }
      // Inventory unfamiliar tools for review, but call() still has its own fixed
      // allowlist. Added/output-schema changes invalidate the reviewed profile too.
      const inventory = result.tools.map(t => ({name: t.name, inputSchema: t.inputSchema, ...(t.outputSchema ? {outputSchema: t.outputSchema} : {})}))
        .sort((a,b) => a.name.localeCompare(b.name));
      const digest = subscriptionHash(inventory);
      const safe = inventory.filter(t => (tools[def.provider] as readonly string[]).includes(t.name));
      return {digest, tools: safe, inventory, reviewed: def.schemaDigests.includes(digest)};
  }
  /** Fixed, non-generating operator reads; each session verifies the CURRENT complete inventory. */
  async readHiggsfieldQualification(def: SubscriptionEndpoint, token: string, input: unknown, assertUsable: VideoTokenGuard, hooks: HggReadHooksV1) {
    const commands = hggReadPlanV1(input);
    const configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (observed.digest !== HGG_READ_SCHEMA_V1 || new Set(observed.inventory.map(t => t.name)).size !== observed.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const results = [];
      for (const command of commands) {
        const request = hggReadRequestV1(command);
        if (!observed.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        await assertUsable(); await hooks.beforeRead(request); await assertUsable();
        scope.request = request;
        const value = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000}));
        scope.request = undefined;
        await assertUsable(); await hooks.afterRead(request, value);
        results.push({readId: request.id, value: decodeHggReadV1(command, value)});
      }
      return results;
    }, assertUsable, false, scope);
  }
  /** Separate cost-only pilot profile. Normal generation allowlists and readiness stay unchanged. */
  async quoteHiggsfieldPilot(def: SubscriptionEndpoint, token: string, input: unknown, evidence: HggPilotEvidenceBytesV1,
    owner: HggPilotQuoteOwnerV1, assertUsable: VideoTokenGuard, hooks: HggPilotQuoteHooksV1) {
    const request = hggPilotQuoteRequestV1(input, evidence, owner), configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/quote'};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (observed.digest !== request.schemaDigest || new Set(observed.inventory.map(t => t.name)).size !== observed.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      if (!observed.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
      await assertUsable(); await hooks.beforeQuote(request); await assertUsable();
      scope.request = request;
      const value = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000}));
      scope.request = undefined;
      await assertUsable(); await hooks.afterQuote(request, value); await assertUsable();
      return decodeHggPilotQuoteV1(request, value);
    }, assertUsable, false, scope);
  }
  /** Native preparation discovers actual context/model IDs; fixed finite reads only. */
  async discoverHiggsfieldPilot(def: SubscriptionEndpoint, token: string, assertUsable: VideoTokenGuard) {
    const configured=this.runtime.definition('higgsfield');
    if(def.provider!=='higgsfield'||def.resource!==configured.resource||def.issuer!==configured.issuer)return videoErrorV1('VIDEO_ACCESS_DENIED',403);
    const scope:OperatorScope={phase:'pilot/workspace'};
    return this.session(def,token,async client=>{
      const inventory=this.inventory(def,await client.listTools({},{timeout:45000}),true);
      if(!HGG_PILOT_EVIDENCE_V1.nativeWireSchemaDigests.includes(inventory.digest)||new Set(inventory.inventory.map(t=>t.name)).size!==inventory.inventory.length)return videoErrorV1('VIDEO_SCHEMA_CHANGED',409);
      const requests=[{tool:'list_workspaces',arguments:{}},{tool:'models_explore',arguments:{action:'list',type:'image',input:'image',limit:100}},{tool:'models_explore',arguments:{action:'list',type:'video',input:'image',limit:100}}];
      const values:Record<string,unknown>[]=[];
      for(const request of requests){
        if(!inventory.inventory.some(t=>t.name===request.tool))return videoErrorV1('VIDEO_TOOL_UNAVAILABLE',409);
        await assertUsable();scope.request=request;
        const value=this.toolValue(await client.callTool({name:request.tool,arguments:request.arguments},undefined,{timeout:45000}));scope.request=undefined;await assertUsable();values.push(value);
      }
      return {workspaces:values[0],imageCatalogue:values[1],videoCatalogue:values[2]};
    },assertUsable,false,scope);
  }
  /** Closed pilot exchange: fresh private-owner context and one exact action, no SDK retries. */
  async exchangeHiggsfieldPilot(def: SubscriptionEndpoint, token: string, action: HggPilotExchangeV1, assertUsable: VideoTokenGuard, hooks: HggPilotExchangeHooksV1 = {}) {
    const wire = hggPilotWireV1(action), workspaceId = action.workspaceId, kind = action.kind;
    const configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'pilot/workspace'};
    return this.session(def, token, async client => {
      const inventory = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (!HGG_PILOT_EVIDENCE_V1.nativeWireSchemaDigests.includes(inventory.digest) || new Set(inventory.inventory.map(t => t.name)).size !== inventory.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const call = async (request: {tool: string; arguments: object}, persistBeforeGuard = false) => {
        if (!inventory.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        await assertUsable(); scope.request = request;
        const raw = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments as Record<string, unknown>}, undefined, {timeout: 45_000}));
        scope.request = undefined;
        if (persistBeforeGuard) await hooks.afterResult?.(raw);
        await assertUsable(); return raw;
      };
      const list = {tool: 'list_workspaces', arguments: {}};
      const initial = await call(list);
      let workspace = hggPrivateWorkspaceV1(initial, workspaceId, kind !== 'select');
      if (kind === 'observe' || kind === 'select' && workspace.is_selected) return {workspace, raw: initial};
      if (kind === 'submit' || kind === 'select') {
        if (!hooks.beforeMutation) return videoErrorV1('VIDEO_PILOT_ADMISSION_REQUIRED', 409);
        await hooks.beforeMutation(); await assertUsable();
      }
      scope.phase = kind === 'submit' ? 'pilot/submit' : kind === 'poll' ? 'pilot/poll' : kind === 'quote' ? 'qualification/quote' : 'pilot/workspace';
      const mutation = kind === 'submit' || kind === 'select';
      const raw = await call(wire!, mutation);
      if (!mutation) await hooks.afterResult?.(raw);
      await assertUsable();
      if (kind === 'select') {
        if (raw.error || raw.success === false) return videoErrorV1('VIDEO_PILOT_WORKSPACE_SELECTION_UNKNOWN', 409);
        if (raw.workspace) hggPrivateWorkspaceV1({workspaces: [raw.workspace]}, workspaceId);
        workspace = hggPrivateWorkspaceV1(await call(list), workspaceId);
      }
      return {workspace, raw};
    }, assertUsable, false, scope);
  }
  async capabilities(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    const result = await this.discover(def, token, assertUsable);
    if (!result.reviewed) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
    return result;
  }
  async call(def: SubscriptionEndpoint, token: string, tool: string, args: Record<string, unknown>, assertUsable?: VideoTokenGuard) {
    if (!(tools[def.provider] as readonly string[]).includes(tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
    return this.session(def, token, async client => {
      const result = await client.callTool({name: tool, arguments: args}, undefined, {timeout: 20_000});
      return this.toolValue(result);
    }, assertUsable);
  }
  private toolValue(result: any): Record<string, any> {
      if (result.isError) return videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
      let value: any = result.structuredContent;
      if (!value) {
        const content = result.content as any[];
        if (content?.length !== 1 || content[0].type !== 'text') return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID');
        try { value = JSON.parse(content[0].text); } catch { return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID'); }
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID');
      if (value.error === 'api_key_required' || value.code === 'api_key_required') return videoErrorV1('VIDEO_SUBSCRIPTION_API_KEY_REQUIRED', 409);
      return value;
  }
}
