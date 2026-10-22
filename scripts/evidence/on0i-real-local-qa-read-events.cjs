#!/usr/bin/env node
'use strict';

// Read the native shared event cache without restarting the warm QA backend.
const qa = require('./on0i-real-local-qa.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
async function main() {
  const stand = qa.loadStand();
  const diagnostic = JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-native-permission-diagnostic-warm.json'), 'utf8'));
  const runId = qa.arg('--run-id', diagnostic.execution?.runId);
  const threadId = qa.arg('--thread', diagnostic.threadId);
  if (!runId || !threadId || !/^[a-f0-9-]{36}$/i.test(runId) || !/^[a-f0-9-]{36}$/i.test(threadId)
      || threadId !== diagnostic.threadId || runId !== diagnostic.execution?.runId) throw new Error('Read only the exact diagnosed owned synthetic run.');
  const config = JSON.parse(fs.readFileSync(path.join(stand.privateDir, 'server-effective-ai.json'), 'utf8')).config;
  qa.secrets.add(config.apiKey); Object.values(config.search.apiKeys || {}).forEach(value => qa.secrets.add(value));
  const { Redis } = require('ioredis');
  const { RedisServerCache } = require('@mastra/redis');
  const { CachingPubSub, EventEmitterPubSub } = require('@mastra/core/events');
  const { AGENT_STREAM_TOPIC } = require('@mastra/core/agent/durable');
  const redis = new Redis(stand.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  const namespace = createHash('sha256').update(stand.env.MASTRA_DATABASE_URL || stand.env.DATABASE_URL).digest('hex').slice(0, 16);
  const cache = new RedisServerCache({ client: redis }, { keyPrefix: `cf:mastra:${namespace}:`, ttlSeconds: 86400 });
  const bus = new CachingPubSub(new EventEmitterPubSub(), cache);
  try {
    if (await redis.get(stand.redisOwnerKey) !== stand.redisOwner) throw new Error('Owned QA Redis marker mismatch.');
    const events = await bus.getHistory(AGENT_STREAM_TOPIC(runId));
    qa.writePrivate(path.join(stand.privateDir, 'warm-native-event-history.json'), { threadId, runId, events });
    const eventView = (event, index) => {
      const entries = [];
      const walk = (value, at, depth) => {
        if (!value || typeof value !== 'object' || depth > 8) return;
        const kept = {};
        for (const key of ['type', 'toolName', 'toolCallId', 'requiresApproval', 'isResumed', 'finishReason', 'status', 'stepId', 'runId']) {
          if (['string', 'number', 'boolean'].includes(typeof value[key])) kept[key] = typeof value[key] === 'string' ? qa.safe(value[key]) : value[key];
        }
        if (value.error !== undefined) {
          const error = value.error;
          kept.error = typeof error === 'string' ? qa.safe(error).slice(0, 1000)
            : error && typeof error === 'object' ? Object.fromEntries(['name', 'code', 'type', 'message'].filter(key => ['string', 'number'].includes(typeof error[key])).map(key => [key, qa.safe(error[key]).slice(0, 1000)]))
            : typeof error;
        }
        if (Object.keys(kept).length) entries.push({ at, ...kept });
        for (const [key, child] of Object.entries(value)) {
          if (['input', 'args', 'messages', 'content', 'text', 'output', 'requestContext'].includes(key)) continue;
          if (Array.isArray(child)) child.forEach((item, i) => walk(item, `${at}.${key}[${i}]`, depth + 1));
          else if (child && typeof child === 'object') walk(child, `${at}.${key}`, depth + 1);
        }
      };
      walk(event, 'event', 0);
      return { index, entries };
    };
    const receipt = { at: new Date().toISOString(), threadId, runId, result: 'NATIVE_HISTORY_READ',
      api: 'CachingPubSub.getHistory(AGENT_STREAM_TOPIC(runId)) using the same supported RedisServerCache namespace',
      warmBackendRestarted: false, providerCalls: 0, events: events.map(eventView), eventCount: events.length,
      rawPrivateFile: path.join(stand.privateDir, 'warm-native-event-history.json') };
    qa.writeEvidence('warm-native-events', receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally { redis.disconnect(); }
}
main().catch(error => { process.stderr.write(`${qa.safe(error.message)}\n`); process.exitCode = 1; });
