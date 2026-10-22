'use strict';

// Passive receipts exclude headers/prompts; synthetic response text stays private.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

function persistObservedOutput(stand, captured, observation) {
  const choices = [...observation.choices.values()].sort((left, right) => left.index - right.index);
  const primary = choices.find(choice => choice.index === 0) || choices[0] || { index: 0, text: '', finishReason: null };
  const describe = choice => ({ index: choice.index,
    sha256: createHash('sha256').update(choice.text).digest('hex'), textChars: choice.text.length,
    numberedLabels: [...choice.text.matchAll(/^\s*(\d+)\.\s/gm)].map(match => Number(match[1])),
    finishReason: choice.finishReason });
  // This flag describes capture completion, not whether the answer is useful.
  const complete = captured.status >= 200 && captured.status < 300 && observation.readReachedEof
    && observation.sawDone && !captured.bodyReadError && captured.providerErrorCode == null
    && observation.parseErrors === 0 && observation.unsupportedContentDeltas === 0;
  const output = { ...describe(primary), complete, completionMeaning: 'FULL_SSE_CAPTURE_ONLY',
    choiceCount: choices.length, choices: choices.map(describe), readReachedEof: observation.readReachedEof,
    sawDone: observation.sawDone, parseErrors: observation.parseErrors,
    unsupportedContentDeltas: observation.unsupportedContentDeltas, persisted: false, privateFile: null };
  try {
    const directory = path.join(stand.privateDir, 'provider-output');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const file = path.join(directory, `${captured.id}.json`);
    fs.writeFileSync(file, `${JSON.stringify({ schema: 'on0i-private-provider-output/v1', receiptId: captured.id,
      at: captured.at, provider: captured.provider, model: captured.model, generationId: captured.generationId,
      complete, completionMeaning: output.completionMeaning, readReachedEof: output.readReachedEof,
      sawDone: output.sawDone, parseErrors: output.parseErrors, bodyReadError: captured.bodyReadError || null,
      choices: choices.map(choice => ({ ...describe(choice), text: choice.text })) }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    output.persisted = true;
    output.privateFile = file;
  } catch (error) { output.privateFileWriteError = error.name; }
  captured.observedOutput = output;
}

function installProviderReceipts(stand) {
  const file = path.join(stand.privateDir, 'provider-receipts.jsonl');
  fs.closeSync(fs.openSync(file, 'a', 0o600));
  const original = globalThis.fetch.bind(globalThis);
  const providers = new Map([['openrouter.ai', 'openrouter'], ['api.openai.com', 'openai'], ['api.tavily.com', 'tavily'], ['api.exa.ai', 'exa']]);
  const append = event => fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const provider = providers.get(url.hostname);
    if (!provider) return original(input, init);
    let body = {};
    try { body = JSON.parse(init?.body || '{}'); } catch { /* A non-JSON request has no model label. */ }
    const receipt = { id: randomUUID(), at: new Date().toISOString(), provider, path: url.pathname,
      model: typeof body.model === 'string' ? body.model : null, stream: body.stream === true, scripted: false };
    const controlFile = path.join(stand.privateDir, 'provider-fault-control.json');
    if (fs.existsSync(controlFile)) {
      const fault = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
      if (fault.owner === stand.owner && fault.enabled === true && provider === 'openrouter'
          && body.model === fault.targetModel && typeof fault.marker === 'string' && fault.marker.length > 20
          && JSON.stringify(body.messages || []).includes(fault.marker)) {
        append({ ...receipt, scripted: true, phase: 'started', fault: 'owned-primary-429' });
        append({ ...receipt, scripted: true, phase: 'completed', status: 429, elapsedMs: 0, fault: 'owned-primary-429', actualProviderRequest: false, usage: null });
        return new Response(JSON.stringify({ error: { message: 'Scripted primary 429 for the uniquely marked owned QA scenario.', type: 'rate_limit_exceeded', code: 429 } }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
      }
    }
    append({ ...receipt, phase: 'started' });
    const started = performance.now();
    let response;
    try { response = await original(input, init); }
    catch (error) {
      append({ ...receipt, phase: 'transport-failed', elapsedMs: Math.round(performance.now() - started), errorName: error.name, billing: 'UNKNOWN' });
      throw error;
    }
    const captured = { ...receipt, phase: 'completed', status: response.status, requestId: response.headers.get('x-request-id'), servedModel: null, generationId: null, usage: null, providerErrorCode: null };
    const observe = value => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.id === 'string') captured.generationId = value.id;
      if (typeof value.model === 'string') captured.servedModel = value.model;
      if (value.error) captured.providerErrorCode = value.error.code ?? value.error.type ?? 'provider_error';
      if (value.usage || value.costDollars) {
        const usage = value.usage || {};
        captured.usage = Object.fromEntries(Object.entries({
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens, costUsd: usage.cost,
          searchCredits: usage.credits, searchCostUsd: value.costDollars?.total,
        }).filter(([, field]) => typeof field === 'number'));
      }
    };
    void (async () => {
      let output;
      try {
        const copy = response.clone();
        if (copy.headers.get('content-type')?.includes('text/event-stream')) {
          if (body.stream === true && ['openrouter', 'openai'].includes(provider)) {
            output = { choices: new Map(), readReachedEof: false, sawDone: false, parseErrors: 0, unsupportedContentDeltas: 0 };
          }
          const observeLine = line => {
            if (!line.startsWith('data: ')) return;
            const data = line.slice(6).trim();
            if (data === '[DONE]') { if (output) output.sawDone = true; return; }
            let value;
            try { value = JSON.parse(data); }
            catch { if (output) output.parseErrors++; return; }
            observe(value);
            // Only the existing cloned observer stream supplies generated text.
            if (output && Array.isArray(value?.choices)) value.choices.forEach((choice, position) => {
              if (!choice || typeof choice !== 'object') return;
              const index = Number.isInteger(choice.index) && choice.index >= 0 ? choice.index : position;
              const seen = output.choices.get(index) || { index, text: '', finishReason: null };
              if (typeof choice.delta?.content === 'string') seen.text += choice.delta.content;
              else if (choice.delta?.content != null) output.unsupportedContentDeltas++;
              if (typeof choice.finish_reason === 'string') seen.finishReason = choice.finish_reason;
              output.choices.set(index, seen);
            });
          };
          const reader = copy.body.getReader(); const decoder = new TextDecoder(); let pending = '';
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) { if (output) output.readReachedEof = true; break; }
            pending += decoder.decode(chunk.value, { stream: true });
            const lines = pending.split('\n'); pending = lines.pop();
            for (const line of lines) observeLine(line);
          }
          pending += decoder.decode();
          if (pending) observeLine(pending);
        } else observe(await copy.json());
      } catch (error) { captured.bodyReadError = error.name; }
      if (output) persistObservedOutput(stand, captured, output);
      captured.elapsedMs = Math.round(performance.now() - started); append(captured);
    })();
    return response;
  };
  return file;
}
module.exports = { installProviderReceipts };
