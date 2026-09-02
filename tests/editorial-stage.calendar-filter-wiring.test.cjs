'use strict';

/**
 * `content-factory-next-pdbe`, point 3: the calendar/list editorial-stage
 * filter has to reach the server as a query parameter, the same road
 * `customer` already travels in `calendar.context.tsx` — not a client-side
 * filter applied over a page that was already fetched without it.
 *
 * The one way this silently breaks is sending `editorialStage=` (empty
 * string) whenever no stage is chosen, the way `customer` already does.
 * `customer` gets away with that because `GetPostsDto.customer` is a plain
 * `@IsString()`. `editorialStage` is `@IsIn(EDITORIAL_STAGE_VALUES)` (see
 * `get.posts.dto.ts`), and an empty string is neither `undefined` — which
 * `@IsOptional()` would forgive — nor one of the four values, so the request
 * would 400 on every single unfiltered calendar and list load. This suite
 * pins down the source pattern that keeps the parameter out of the query
 * string entirely when it is unset, on both the calendar and the list reads,
 * and confirms it is present when a stage is chosen.
 *
 * A full render of `CalendarWeekProvider` would exercise this more directly,
 * but the provider pulls in `useSWR`, `next/navigation`, `react-dnd` and
 * timezone plumbing that would have to be mocked wholesale to reach two
 * `URLSearchParams` calls; the source-pattern check below is the proportionate
 * one, and `editorial-stage.filter.test.cjs` already exercises the server
 * side of the same contract end to end.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextPath = path.join(
  root,
  'apps/frontend/src/components/launches/calendar.context.tsx'
);
const filtersPath = path.join(
  root,
  'apps/frontend/src/components/launches/filters.tsx'
);
const source = fs.readFileSync(contextPath, 'utf8');
const filtersSource = fs.readFileSync(filtersPath, 'utf8');

/**
 * A chainable stand-in for `newDayjs(...)`: the real code only calls
 * `.startOf(...).utc().format()`, and this test cares about which keys land
 * in the query string, not about date formatting.
 */
const fakeDayjsChain = {
  startOf: () => fakeDayjsChain,
  endOf: () => fakeDayjsChain,
  utc: () => fakeDayjsChain,
  format: () => 'stub-date',
};
const fakeNewDayjs = () => fakeDayjsChain;

/** Mimics the object literal a real call would build, using the real code. */
function buildParams(codeBlockPattern, filters) {
  const match = source.match(codeBlockPattern);
  if (!match) throw new Error('pattern not found in calendar.context.tsx');
  // eslint-disable-next-line no-new-func
  const build = new Function(
    'filters',
    'newDayjs',
    `return (${match[1]});`
  );
  return build(filters, fakeNewDayjs);
}

describe('the calendar-view fetch omits editorialStage when unset, sends it when set', () => {
  const pattern = /const loadData = useCallback\(async \(\) => \{\s*const modifiedParams = new URLSearchParams\((\{[\s\S]*?\})\)\.toString/;

  test('omitted (not an empty string) when no stage is chosen', () => {
    const built = buildParams(pattern, {
      display: 'week',
      customer: null,
      editorialStage: null,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
    expect('editorialStage' in built).toBe(false);
  });

  test('present when a stage is chosen', () => {
    const built = buildParams(pattern, {
      display: 'week',
      customer: null,
      editorialStage: 'REVIEW',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
    expect(built.editorialStage).toBe('REVIEW');
  });
});

describe('the list-view fetch omits editorialStage when unset, sends it when set', () => {
  const pattern = /const listParams = useMemo\(\(\) => \{\s*return new URLSearchParams\((\{[\s\S]*?\})\)\.toString/;
  const match = source.match(pattern);
  if (!match) throw new Error('listParams pattern not found in calendar.context.tsx');
  // eslint-disable-next-line no-new-func
  const build = new Function(
    'listPage',
    'filters',
    'listState',
    `return (${match[1]});`
  );

  test('omitted (not an empty string) when no stage is chosen', () => {
    const built = build(0, { customer: null, editorialStage: null }, 'all');
    expect('editorialStage' in built).toBe(false);
  });

  test('present when a stage is chosen', () => {
    const built = build(0, { customer: null, editorialStage: 'PLAN' }, 'all');
    expect(built.editorialStage).toBe('PLAN');
  });
});

describe('every setFilters call in the toolbar carries the current stage forward', () => {
  test('switching view, date or customer never drops the active stage filter', () => {
    const calls = filtersSource.match(/calendar\.setFilters\(\{[\s\S]*?\}\);/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(
        /editorialStage(:\s*(calendar\.editorialStage|editorialStage)\s*,|\s*,)/
      );
    }
  });

  test('the toolbar renders the stage filter control next to the customer selector', () => {
    expect(filtersSource).toMatch(/<SelectCustomer[\s\S]*?\/>\s*<EditorialStageFilter/);
  });
});
