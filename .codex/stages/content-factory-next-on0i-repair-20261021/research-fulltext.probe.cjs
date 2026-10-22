'use strict';

// Controlled, offline integration reproducer. The provider returns a complete
// long page; production research code must preserve its late evidence while
// keeping the existing model-facing excerpt bounded.
const assert = require('node:assert/strict');
const path = require('node:path');
require('reflect-metadata');
const root = path.resolve(__dirname, '../../..');
const { loadWithMocks } = require(path.join(root, 'tests/helpers/load-ts-with-mocks.cjs'));
const marker = 'LATE_OWNED_EVIDENCE: read the complete source without another search.';
const rawContent = 'Reference manual.\n\n' + 'Earlier section with ordinary explanatory prose.\n\n'.repeat(4_500) + marker;
const config = {
  usageMode: 'workspace_key', provider: 'openrouter', apiKey: 'offline-model-key',
  search: { enabled: true, provider: 'exa', apiKey: 'offline-search-key',
    apiKeys: { exa: 'offline-search-key' }, keySources: { exa: 'own' },
    depth: 'advanced', topic: 'general' },
};
let providerCalls = 0;
let modelCalls = 0;
const { WebResearchService, PAGE_TEXT_MAX_CHARS } = loadWithMocks('libraries/nestjs-libraries/src/openai/web.research.service.ts', {
  '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
    getActiveAiConfig: () => config, loadAiConfig: async () => config,
    requireActiveAiConfig: async () => config,
    withActiveAiConfig: (_org, _config, run) => run(),
  },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000, WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000, WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
    getChatModel: async () => { modelCalls += 1; throw new Error('Model calls forbidden in controlled probe'); },
    getWebSearchClient: async () => ({ invoke: async () => {
      providerCalls += 1;
      return { results: [{ url: 'https://primary.example/manual', title: 'Reference manual', rawContent }] };
    } }),
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
});
const usage = { beginAiOperationWithConfig: async () => ({
  run: run => run(), track: run => run(), finish: async () => {},
}) };

(async () => {
  const research = new WebResearchService(usage, undefined, { fetchImpl: async () => { throw new Error('External network forbidden'); } });
  const result = await research.research('offline-owned-org', 'Read the reference manual', {
    level: 'deep', language: 'en', queries: ['reference manual source'],
  });
  const source = result.sources.find(row => row.url === 'https://primary.example/manual');
  assert(source, 'The original source URL must survive');
  const retainedText = source.fullText ?? source.text ?? '';
  console.log(JSON.stringify({
    kind: 'CONTROLLED_OFFLINE_REAL_RESEARCH_SERVICE', rawCharacters: rawContent.length,
    previewCharacters: source.text?.length, retainedCharacters: retainedText.length,
    lateEvidenceRetained: retainedText.includes(marker), providerCalls, modelCalls,
    actualNetworkCalls: 0, paidCalls: 0,
  }));
  assert(providerCalls === 1 && modelCalls === 0, 'Exactly one synthetic provider response and no model');
  assert((source.text?.length ?? 0) <= PAGE_TEXT_MAX_CHARS, 'Existing prompt preview must remain bounded');
  assert(retainedText.includes(marker), 'Complete owned source must retain evidence beyond preview and scan caps');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
