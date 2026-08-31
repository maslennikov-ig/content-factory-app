'use strict';

/**
 * The organization's own model, built the way the product builds it.
 *
 * The stand pays with the space's key and calls the space's model, because a
 * number obtained from a different model is a number about that model. The
 * settings come from `AiProviderSetting` exactly as `loadAiConfig` reads them,
 * including the legacy IV decryption, which is imported from the shipped
 * helper rather than copied: a second implementation of a decryption detail is
 * a second thing to get wrong.
 *
 * `included` mode is refused rather than silently answered from the operator
 * key. A stand run is deliberate spending, and it should be spending the key
 * the space is actually generating with.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TEXT_MODEL = {
  openai: 'gpt-4.1',
  openrouter: 'openai/gpt-5.6-luna',
};

/** `.env` at the tree root, for `JWT_SECRET` and nothing else. */
function loadDotEnv() {
  const file = path.join(REPO, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

function decryptKey(hex) {
  loadDotEnv();
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set; the stored key cannot be read');
  }
  const { loadTypeScriptModule } = require(path.join(
    REPO,
    'tests/helpers/load-tsx.cjs'
  ));
  const auth = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
  return auth.decrypt_legacy_using_IV(hex);
}

function resolveAiConfig(aiSetting) {
  if (!aiSetting) {
    throw new Error('this space has no AI provider setting');
  }
  if ((aiSetting.usageMode || 'workspace_key') === 'included') {
    throw new Error(
      'this space is on included mode; point the stand at a space with its own key'
    );
  }
  if (!aiSetting.apiKey) {
    throw new Error('this space has no stored generation key');
  }
  const provider = aiSetting.provider || 'openai';
  return {
    provider,
    apiKey: decryptKey(aiSetting.apiKey),
    baseUrl: provider === 'openrouter' ? OPENROUTER_BASE_URL : undefined,
    textModel: aiSetting.textModel || DEFAULT_TEXT_MODEL[provider],
  };
}

/**
 * Flex: the same model, served from spare capacity, at half the price.
 *
 * A stand run is the shape flex exists for — nobody is waiting on the answer,
 * and the bill is the only thing that scales with how many questions the epic
 * asks. Measured on this space's own key: identical token counts, $0.00000495
 * against $0.0000099.
 *
 * Two properties make it safe to spend a run on. Flex never falls back to the
 * default tier — a capacity shortage surfaces as an error rather than as a
 * silent full-price call, so the run cannot quietly cost twice what it said it
 * would. And `generate.cjs` flushes every generation as it lands, so a run
 * interrupted by that error resumes without buying anything twice.
 *
 * Not batch, which is the other half-price road and the wrong one here: it is
 * a separate model slug served from a deferred queue, and a generation is two
 * calls in sequence — the content node writes against the hook the first call
 * returned. Sixty-four such pairs through a queue is a run measured in hours
 * of waiting for a saving flex gives synchronously.
 *
 * The tier is recorded in the run's `meta.json` rather than assumed. It is the
 * same model either way, and the comparison is paired inside one run, so a
 * tier effect would cancel across every arm — but this epic exists because a
 * shortcut was once taken for a method, and «which tier wrote these numbers»
 * is exactly the question a later reader should not have to guess at.
 */
const FLEX_TIMEOUT_MS = 15 * 60_000;

/**
 * The same class, timeout and retry budget `ai.clients.ts` uses, so a run that
 * times out here would have timed out in the product too — except on flex,
 * where the provider asks for a patient client and a minute is not one.
 */
function buildChatModel(aiSetting, temperature = 0.7, options = {}) {
  const config = resolveAiConfig(aiSetting);
  const serviceTier = options.serviceTier || null;
  if (serviceTier && serviceTier !== 'flex') {
    throw new Error(`unknown service tier "${serviceTier}"; known: flex`);
  }
  const { ChatOpenAI } = require('@langchain/openai');
  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.textModel,
    temperature,
    timeout: serviceTier ? FLEX_TIMEOUT_MS : 60_000,
    maxRetries: serviceTier ? 4 : 2,
    // `service_tier` rides at the top level of the request body, which is what
    // `modelKwargs` is for: LangChain has no field of its own for it.
    ...(serviceTier ? { modelKwargs: { service_tier: serviceTier } } : {}),
    ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}),
  });
  return {
    model,
    provider: config.provider,
    textModel: config.textModel,
    serviceTier,
  };
}

module.exports = { buildChatModel, resolveAiConfig };
