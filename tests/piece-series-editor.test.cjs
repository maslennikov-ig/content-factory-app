'use strict';
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { adaptationEditions, selectedAdaptation } = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/pieces/piece-series.ts');
const part = (series, index, total, createdAt, extra = {}) => ({
  id: `${series}-${index}`, integrationId: 'channel', platform: 'telegram', kind: 'post', state: 'draft',
  createdAt, body: `Saved ${series} ${index}`, series: { id: series, index, total }, ...extra,
});
const cases = () => [
  ...Array.from({ length: 12 }, (_, i) => part('old', i + 1, 12, '2026-10-30T15:52:00Z')),
  ...Array.from({ length: 3 }, (_, i) => part('new', 3 - i, 3, '2026-10-31T11:49:00Z')),
];

test('realistic twelve-plus-three shape defaults to first post of latest series, without changing the saved rows', () => {
  const rows = cases();
  rows.forEach(Object.freeze); Object.freeze(rows);
  const groups = adaptationEditions(rows);
  expect(groups.map(group => group.parts.length)).toEqual([3, 12]);
  expect(groups[0].parts.map(row => row.id)).toEqual(['new-1', 'new-2', 'new-3']);
  expect(selectedAdaptation(rows).id).toBe('new-1');
  expect(rows[0].id).toBe('old-1'); expect(rows[12].id).toBe('new-3');
  expect(groups.flatMap(group => group.parts)).toHaveLength(rows.length);
});
test('an explicit old artifact or selected part wins; missing/deleted selection falls back safely', () => {
  const rows = cases();
  expect(selectedAdaptation(rows, 'old-8')).toBe(rows[7]);
  expect(selectedAdaptation(rows, 'new-2').id).toBe('new-2');
  expect(selectedAdaptation(rows, 'deleted').id).toBe('new-1');
  expect(selectedAdaptation([], 'deleted')).toBeNull();
});
test('group identity includes the channel and uses native identity, never similar labels or totals', () => {
  const rows = [part('same', 1, 2, '2026-10-30'), part('same', 2, 2, '2026-10-30', { integrationId: 'other' }),
    part('different', 1, 2, '2026-10-31', { title: 'Same title' })];
  expect(adaptationEditions(rows)).toHaveLength(3);
});
test('ordinary and undated legacy versions remain available; a newer standalone post can be the latest result', () => {
  const rows = [part('old', 1, 2, '2026-10-30'), part('legacy', 1, 1, '', { series: undefined }),
    part('single', 1, 1, '2026-11-01', { series: undefined })];
  const groups = adaptationEditions(rows);
  expect(groups.map(group => group.parts[0].id)).toEqual(['single-1', 'old-1', 'legacy-1']);
  expect(groups[2].createdAt).toBeNull();
  expect(selectedAdaptation(rows).id).toBe('single-1');
  expect(selectedAdaptation(rows, 'legacy-1').id).toBe('legacy-1');
});
test.each([2, 4, 9])('the count and order follow saved data for %i members', count => {
  const rows = Array.from({ length: count }, (_, i) => part('arbitrary', count - i, count, '2026-10-31'));
  expect(adaptationEditions(rows)[0].parts.map(row => row.series.index)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
});
