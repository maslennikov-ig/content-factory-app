'use strict';

/**
 * `content-factory-next-75xn`: a search names what it is for, and a key names
 * which engine may spend it.
 *
 * Two claims, and both of them are about money leaving the building.
 *
 * The first replaces a defence that cost the workspace its other key. Until
 * this bead a workspace had one search key, so saving a new engine had to wipe
 * it — a key left beside a changed engine name would have been handed to
 * whichever API the name then pointed at. Addressing the key by engine removes
 * the danger instead of paying for it, and the tests below state the stronger
 * promise directly: there is no call here that returns one engine's key when
 * asked about another.
 *
 * The second is the routing. Exa measured more accurate on research; Tavily
 * returns the short citable snippet and takes a published-date window. One
 * engine per workspace meant choosing which to lose. A task now chooses, and
 * an unconfigured task keeps exactly the behaviour the product had before.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const tasks = () =>
  loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.search-tasks.ts');

describe('a key belongs to one engine', () => {
  test('an engine is answered with its own key and never with another', () => {
    const { searchKeyFor } = tasks();
    const source = {
      provider: 'tavily',
      apiKey: 'tavily-key',
      apiKeys: { tavily: 'tavily-key', exa: 'exa-key' },
    };

    expect(searchKeyFor('tavily', source)).toBe('tavily-key');
    expect(searchKeyFor('exa', source)).toBe('exa-key');
    // OpenRouter answers a search question with the workspace's generation
    // key, so it has none of its own and must not borrow one.
    expect(searchKeyFor('openrouter', source)).toBe('');
  });

  test('an engine with no key of its own gets nothing, not the default one', () => {
    const { searchKeyFor } = tasks();
    const source = {
      provider: 'tavily',
      apiKey: 'tavily-key',
      apiKeys: { tavily: 'tavily-key' },
    };

    expect(searchKeyFor('exa', source)).toBe('');
  });

  test('a configuration written before the map still answers for its engine', () => {
    const { searchKeyFor } = tasks();
    // Every row saved before `searchApiKeys` existed, and every configuration
    // assembled by something that only knows the older shape.
    const legacy = { provider: 'exa', apiKey: 'exa-key' };

    expect(searchKeyFor('exa', legacy)).toBe('exa-key');
    expect(searchKeyFor('tavily', legacy)).toBe('');
  });

  test('an unusable stored entry is dropped rather than repaired', () => {
    const { parseSearchKeys, MAX_SEARCH_KEY_LENGTH } = tasks();

    expect(
      parseSearchKeys({
        tavily: '  spaced  ',
        exa: '',
        openrouter: 42,
        brave: 'not-an-engine-we-know',
        wikipedia: 'keyless-lane-is-not-an-engine',
      })
    ).toEqual({ tavily: 'spaced' });
    expect(
      parseSearchKeys({ tavily: 'x'.repeat(MAX_SEARCH_KEY_LENGTH + 1) })
    ).toEqual({});
    expect(parseSearchKeys(null)).toEqual({});
    expect(parseSearchKeys(['tavily'])).toEqual({});
  });
});

describe('a task chooses an engine', () => {
  test('an empty map routes nothing and every task keeps the workspace engine', () => {
    const { SEARCH_TASKS, providerForSearchTask } = tasks();
    const source = { provider: 'tavily', apiKeys: { tavily: 'k' } };

    for (const task of SEARCH_TASKS) {
      expect(providerForSearchTask(task, source)).toBe('tavily');
    }
  });

  test('a routed task reaches its engine and its neighbours do not', () => {
    const { providerForSearchTask } = tasks();
    const source = {
      provider: 'tavily',
      apiKeys: { tavily: 'tavily-key', exa: 'exa-key' },
      taskProviders: { research: 'exa' },
    };

    expect(providerForSearchTask('research', source)).toBe('exa');
    expect(providerForSearchTask('facts', source)).toBe('tavily');
    expect(providerForSearchTask('discovery', source)).toBe('tavily');
  });

  /**
   * A person picks Exa for research and has not pasted its key yet. The button
   * that worked yesterday must work today: a route with no key behind it steps
   * back to the engine the workspace already searches with rather than failing.
   */
  test('a route to an engine with no key falls back instead of failing', () => {
    const { providerForSearchTask } = tasks();
    const source = {
      provider: 'tavily',
      apiKeys: { tavily: 'tavily-key' },
      taskProviders: { research: 'exa' },
    };

    expect(providerForSearchTask('research', source)).toBe('tavily');
  });

  test('OpenRouter is routable without a search key, because it spends the other one', () => {
    const { providerForSearchTask } = tasks();
    const source = {
      provider: 'tavily',
      apiKeys: { tavily: 'tavily-key' },
      taskProviders: { facts: 'openrouter' },
    };

    expect(providerForSearchTask('facts', source)).toBe('openrouter');
  });

  test('an unusable stored route is dropped rather than repaired', () => {
    const { parseSearchTaskProviders } = tasks();

    expect(
      parseSearchTaskProviders({
        research: 'exa',
        facts: 'brave',
        drafting: 'tavily',
        discovery: 7,
      })
    ).toEqual({ research: 'exa' });
    expect(parseSearchTaskProviders(undefined)).toEqual({});
  });

  test('an unknown engine name reads as the one the product started with', () => {
    const { readSearchProvider } = tasks();

    expect(readSearchProvider('exa')).toBe('exa');
    // The column predates the choice, so rows written before it hold names
    // this list may not have; searching with the previous engine is a better
    // answer than not searching at all.
    expect(readSearchProvider('searxng')).toBe('tavily');
    expect(readSearchProvider(null)).toBe('tavily');
  });
});

describe('the client cache key follows the routing', () => {
  test('changing a route or adding a key changes the fingerprint', () => {
    const { searchRouteFingerprint } = tasks();
    const base = { provider: 'tavily', apiKeys: { tavily: 'k' } };

    expect(searchRouteFingerprint(base)).toBe(
      searchRouteFingerprint({ provider: 'tavily', apiKeys: { tavily: 'k' } })
    );
    expect(
      searchRouteFingerprint({ ...base, taskProviders: { research: 'exa' } })
    ).not.toBe(searchRouteFingerprint(base));
    expect(
      searchRouteFingerprint({
        ...base,
        apiKeys: { tavily: 'k', exa: 'e' },
      })
    ).not.toBe(searchRouteFingerprint(base));
  });

  test('the fingerprint says whether a key exists, never what it is', () => {
    const { searchRouteFingerprint } = tasks();

    expect(
      searchRouteFingerprint({
        provider: 'exa',
        apiKeys: { exa: 'secret-value' },
      })
    ).not.toContain('secret-value');
  });
});
