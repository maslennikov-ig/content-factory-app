'use strict';

const { fixture, input, internalInput, runScheduled } = require('./helpers/automation-disablement.module.cjs');

let log;
beforeEach(() => { log = jest.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { log.mockRestore(); });

test.each([
  ['plug switched off', f => { f.state.plug.activated = false; }],
  ['channel switched off', f => { f.state.source.disabled = true; }],
  ['channel deleted', f => { f.state.source.deletedAt = new Date('2000-01-01Z'); }],
])('%s after scheduling makes no provider call', async (_name, disable) => {
  const f = fixture();
  const scheduled = structuredClone(input);
  disable(f);
  expect(await f.service.processPlugs(scheduled)).toBe(true);
  expect(f.provider.promote).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(1);
});

test('disabled internal destination makes no provider call', async () => {
  const f = fixture();
  f.state.target.disabled = true;
  expect(await f.service.processInternalPlug(internalInput)).toBeUndefined();
  expect(f.provider.repost).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(1);
});

test('enabled global and internal actions retain arguments and return contracts', async () => {
  const f = fixture();
  expect(await f.service.processPlugs(input)).toBe(false);
  expect(f.provider.promote).toHaveBeenCalledWith(f.state.source, input.postId, { text: 'Synthetic content' });
  expect(f.provider.promote.mock.contexts[0]).toBe(f.provider);
  expect(await f.service.processInternalPlug(internalInput)).toBeUndefined();
  expect(f.provider.repost).toHaveBeenCalledWith(f.state.target, f.state.source, internalInput.post, internalInput.information);
  expect(f.provider.repost.mock.contexts[0]).toBe(f.provider);
  expect(log).not.toHaveBeenCalled();
});

test.each([
  ['removed plug', f => { f.state.plug = null; }, 'plug_missing'],
  ['inactive plug with unreadable fields', f => { f.state.plug.activated = false; f.state.plug.data = 'invalid JSON'; }, 'plug_inactive'],
  ['missing channel', f => { f.state.plug.integration = null; }, 'channel_unavailable'],
  ['different organization', f => { f.state.plug.organizationId = 'foreign'; }, 'organization_mismatch'],
  ['removed capability', f => { f.manager.getAllPlugs.mockReturnValue([]); }, 'capability_unavailable'],
  ['disabled capability', f => { f.manager.getAllPlugs.mockReturnValue([{ identifier: 'synthetic', plugs: [{ methodName: 'promote', disabled: true }] }]); }, 'capability_unavailable'],
  ['arbitrary provider method', f => { f.state.plug.plugFunction = 'repost'; }, 'capability_unavailable'],
  ['removed provider', f => { f.manager.getSocialIntegration.mockReturnValue(undefined); }, 'capability_unavailable'],
  ['missing implementation', f => { delete f.provider.promote; }, 'capability_unavailable'],
])('global %s produces a fixed safe skip before dispatch', async (_name, change, reason) => {
  const f = fixture();
  const promote = f.provider.promote;
  change(f);
  expect(await f.service.processPlugs({ ...input, postId: 'private-id' })).toBe(true);
  expect(promote).not.toHaveBeenCalled();
  expect(f.provider.repost).not.toHaveBeenCalled();
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'automation_skipped', kind: 'global', reason })]]);
});

test.each(['source', 'target'])('internal action rechecks disabled/deleted/removed %s', async (side) => {
  for (const patch of [{ disabled: true }, { deletedAt: new Date('2000-01-01Z') }, null]) {
    const f = fixture();
    if (patch) Object.assign(f.state[side], patch); else f.state[side] = null;
    log.mockClear();
    expect(await f.service.processInternalPlug(internalInput)).toBeUndefined();
    expect(f.provider.repost).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'automation_skipped', kind: 'internal',
      reason: side === 'source' ? 'source_channel_unavailable' : 'destination_channel_unavailable' })]]);
  }
});

test.each([
  ['removed metadata', f => { f.manager.getInternalPlugs.mockReturnValue({ internalPlugs: [] }); }],
  ['disabled metadata', f => { f.manager.getInternalPlugs.mockReturnValue({ internalPlugs: [{ identifier: 'repost', methodName: 'repost', disabled: true }] }); }],
  ['missing method', f => { delete f.provider.repost; }],
  ['unknown provider', f => { f.manager.getSocialIntegration.mockReturnValue(undefined); }],
])('internal %s is skipped without a retrying error', async (_name, change) => {
  const f = fixture();
  const repost = f.provider.repost;
  change(f);
  expect(await f.service.processInternalPlug(internalInput)).toBeUndefined();
  expect(repost).not.toHaveBeenCalled();
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'automation_skipped', kind: 'internal', reason: 'capability_unavailable' })]]);
});

test('fresh fields/token are used; enabled false/true/last-run results remain compatible', async () => {
  const f = fixture();
  f.state.plug.data = JSON.stringify([{ name: 'text', value: 'Updated content' }]);
  f.state.source.token = 'new-synthetic-token';
  expect(await f.service.processPlugs({ ...input, currentRun: undefined })).toBe(false);
  expect(f.provider.promote.mock.calls[0]).toEqual([f.state.source, input.postId, { text: 'Updated content' }]);
  expect(await f.service.processPlugs({ ...input, currentRun: 3 })).toBe(true);
  f.provider.promote.mockResolvedValue(true);
  expect(await f.service.processPlugs(input)).toBe(true);
  expect(log).not.toHaveBeenCalled();
});

test('enabled provider failure propagates rather than becoming a safe skip', async () => {
  const f = fixture();
  const error = new Error('synthetic provider failure');
  f.provider.promote.mockRejectedValue(error);
  f.provider.repost.mockRejectedValue(error);
  await expect(f.service.processPlugs(input)).rejects.toBe(error);
  await expect(f.service.processInternalPlug(internalInput)).rejects.toBe(error);
  expect(log).not.toHaveBeenCalled();
});

describe.each([1, 2, 3, 4, 5, 6])('unchanged V10%s cached workflow fixture', (version) => {
  test.each([
    ['plug off', f => { f.state.plug.activated = false; }],
    ['channel off', f => { f.state.source.disabled = true; }],
    ['channel deleted', f => { f.state.source.deletedAt = new Date('2000-01-01Z'); }],
    ['capability off', f => { f.manager.getAllPlugs.mockReturnValue([]); }],
  ])('%s during sleep skips provider and drops later repetitions of only that plug', async (_name, disable) => {
    const f = fixture();
    const calls = await runScheduled(version, f, { onWake: () => disable(f) });
    expect(calls.scheduled).toBe(true);
    expect(calls.processPlug).toBe(1);
    expect(calls.wakes).toBe(1);
    expect(f.provider.promote).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  test('enabled cached global action still performs all false-result repetitions', async () => {
    const f = fixture();
    const calls = await runScheduled(version, f);
    expect(calls.processPlug).toBe(3);
    expect(f.provider.promote).toHaveBeenCalledTimes(3);
    expect(log).not.toHaveBeenCalled();
  });

  test('internal destination disabled during sleep is skipped', async () => {
    const f = fixture();
    const calls = await runScheduled(version, f, { kind: 'internal', onWake: () => { f.state.target.disabled = true; } });
    expect(calls.processInternalPlug).toBe(1);
    expect(f.provider.repost).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  test('enabled cached internal action retains the void activity contract', async () => {
    const f = fixture();
    const calls = await runScheduled(version, f, { kind: 'internal' });
    expect(calls.processInternalPlug).toBe(1);
    expect(f.provider.repost).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});

test('skipping one plug leaves another cached plug running', async () => {
  const f = fixture();
  const other = { ...structuredClone(f.state.plug), id: 'other-plug', integration: f.state.target };
  f.repo.getPlug.mockImplementation(async id => structuredClone(id === 'plug' ? f.state.plug : other));
  const calls = await runScheduled(6, f, {
    extraGlobal: [{ plugId: 'other-plug', type: 'global', delay: 10, totalRuns: 3 }],
    onWake: () => { f.state.plug.activated = false; },
  });
  expect(calls.processPlug).toBe(4);
  expect(f.provider.promote).toHaveBeenCalledTimes(3);
  expect(f.provider.promote.mock.calls.every(call => call[0].id === 'target')).toBe(true);
  expect(log).toHaveBeenCalledTimes(1);
});
