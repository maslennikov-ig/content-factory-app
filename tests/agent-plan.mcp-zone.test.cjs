'use strict';

/**
 * `content-factory-next-kcxz.42`: the plan's capabilities over MCP name their
 * zone, the rule `channel.times` follows since review W3-19 P3-9 — one helper
 * (`catalogue/named-zone.ts`) for both. An MCP call has no browser, so its
 * identity falls back to the saved offset or UTC, which knows no summer time;
 * a «today», a day range or a local time read in it is a guess. Over MCP a
 * plan call without an IANA `timeZone` is refused (`PLAN_TIME_ZONE_REQUIRED`)
 * and nothing is read or written; an unknown one is refused
 * (`PLAN_TIME_ZONE_UNKNOWN`). The web chat keeps the identity's zone.
 */

const {
  IDENTITY,
  executeTool,
  fixtures,
  loadRegistry,
  permissionsService,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((one) => one.id === id);
// Scheduling and moving ask in the conversation over MCP (kcxz.49); their
// question says times in the named zone, so they name it too.
const PLAN_MCP = ['plan.ahead', 'plan.calendar', 'plan.ready', 'plan.place', 'plan.unschedule', 'plan.schedule', 'plan.move'];

/** The fixture's services, every call recorded. */
const recorded = (services) => {
  const calls = [];
  const wrapped = Object.fromEntries(
    Object.entries(services).map(([name, service]) => [
      name,
      new Proxy(service, {
        get: (target, key) =>
          typeof target[key] === 'function'
            ? (...args) => (calls.push([name, key, args]), target[key](...args))
            : target[key],
      }),
    ])
  );
  return { calls, services: wrapped };
};

const setup = (id, entrance) => {
  const fixture = fixtures()[id];
  const { calls, services } = recorded(fixture.services);
  const tool = registry.buildCapabilityTool(find(id), {
    services: servicesFrom(services),
    language: 'en',
    entrance,
    ...(entrance === 'mcp' ? { gate: new registry.DoorPolicyGate(permissionsService()) } : {}),
  });
  // MCP knows no browser: the identity's zone is the saved offset or UTC.
  const context = requestContextFor(registry, {
    ...IDENTITY,
    role: 'ADMIN',
    timeZone: entrance === 'mcp' ? '+03:00' : 'Europe/Moscow',
  });
  return { tool, calls, context, input: fixture.input };
};

/** Service calls that are not the policy gate's own reads. */
const work = (calls) => calls.filter(([name]) => name === 'PostsService' || name === 'PieceService');

describe('kcxz.42: the plan over MCP names its zone', () => {
  test('every plan capability MCP lists takes `timeZone`', () => {
    const mcp = registry.CAPABILITY_CATALOGUE.filter(
      (one) => one.id.startsWith('plan.') && registry.isMcpCapability(one)
    ).map((one) => one.id);
    expect(mcp).toEqual(PLAN_MCP);
    for (const id of mcp) expect(Object.keys(find(id).input.shape)).toContain('timeZone');
  });

  test.each(PLAN_MCP)('%s over MCP without a zone is refused before any service call', async (id) => {
    const { tool, calls, context, input } = setup(id, 'mcp');
    const { output } = await executeTool(tool, input, { requestContext: context });
    expect(output).toMatchObject({ ok: false, code: 'PLAN_TIME_ZONE_REQUIRED' });
    expect(work(calls)).toEqual([]);
  });

  test.each(PLAN_MCP)('%s over MCP with an unknown zone is refused, never guessed', async (id) => {
    const { tool, calls, context, input } = setup(id, 'mcp');
    const { output } = await executeTool(tool, { ...input, timeZone: 'Mars/Olympus' }, { requestContext: context });
    expect(output).toMatchObject({ ok: false, code: 'PLAN_TIME_ZONE_UNKNOWN' });
    expect(work(calls)).toEqual([]);
  });

  test('plan.calendar over MCP reads the named zone’s days (+05:30, a half-hour zone)', async () => {
    const { tool, calls, context, input } = setup('plan.calendar', 'mcp');
    const { output } = await executeTool(
      tool,
      { ...input, timeZone: 'Asia/Kolkata' },
      { requestContext: context }
    );
    expect(output).toMatchObject({ ok: true });
    // 28.09 00:00 at +05:30 is 27.09 18:30 UTC; 04.10 ends at 18:29:59 UTC.
    const [[, , [, query]]] = work(calls);
    expect(query).toMatchObject({ startDate: '2026-09-27T18:30:00Z', endDate: '2026-10-04T18:29:59Z' });
  });

  test('plan.ahead over MCP counts days in the named zone', async () => {
    const { tool, calls, context } = setup('plan.ahead', 'mcp');
    const { output } = await executeTool(tool, { timeZone: 'Europe/Berlin' }, { requestContext: context });
    // The summary is wrapped as untrusted data (channel names).
    expect(output.ok).toBe(true);
    expect(JSON.stringify(output.summary)).toContain('"zone":"Europe/Berlin"');
    expect(work(calls)[0][2][1]).toEqual({ timeZone: 'Europe/Berlin' });
  });

  test('the web chat keeps the person’s zone from the identity', async () => {
    const { tool, calls, context, input } = setup('plan.calendar', 'chat');
    const { output } = await executeTool(tool, input, { requestContext: context });
    expect(output.ok).toBe(true);
    expect(JSON.stringify(output.summary)).toContain('"zone":"Europe/Moscow"');
    // 28.09 00:00 in Moscow (+03:00) is 27.09 21:00 UTC.
    expect(work(calls)[0][2][1]).toMatchObject({ startDate: '2026-09-27T21:00:00Z' });
  });

  test('channel.times and the plan share one helper; nothing copies it', () => {
    const fs = require('node:fs');
    const read = (file) =>
      fs.readFileSync(`${__dirname}/../libraries/nestjs-libraries/src/chat/capabilities/catalogue/${file}`, 'utf8');
    for (const file of ['channel.capabilities.ts', 'plan.capabilities.ts']) {
      const source = read(file);
      expect(source).toContain("from './named-zone'");
      expect(source).not.toContain('resolveTimeZone(');
      expect(source).not.toContain('_TIME_ZONE_REQUIRED');
    }
  });
});
