/**
 * Which search engine a web call reaches, decided by what the call is for —
 * and which stored key that engine is allowed to spend.
 *
 * Until `content-factory-next-75xn` a workspace had one search engine and one
 * search key. The single key forced a defence that cost the workspace its
 * other key: saving a new engine wiped the stored one, because a key kept
 * beside a changed engine name would have been handed to whichever API the
 * name now pointed at. Addressing a key by its engine removes the danger
 * instead of paying for it — a Tavily key lives under `tavily` and there is no
 * path by which `exa` can read it.
 *
 * The second lever is the task. The engines are not interchangeable: Exa
 * measured more accurate on research and answers a query written as a
 * description of the wanted page, while Tavily returns a short citable snippet
 * and a summary, and takes a published-date window and a country. One engine
 * for the whole workspace meant choosing which of those to lose. A call now
 * says what it is doing, and this file, and only this file, turns that into an
 * engine.
 *
 * Deliberately importless, for the same reason `ai.roles.ts` is: the provider
 * configuration, the client factories and the research service all need these
 * types, and an import in the other direction would close a cycle through
 * three modules that every search loads.
 */

/**
 * The engines behind the one client port in `ai.clients.ts`.
 *
 * `openrouter` is the odd one: it is the workspace's generation provider
 * answering a search question with its own web plugin, so it spends the
 * generation key and has no search key of its own.
 */
export const SEARCH_PROVIDERS = ['tavily', 'openrouter', 'exa'] as const;

export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

export const isSearchProvider = (value: unknown): value is SearchProvider =>
  typeof value === 'string' &&
  (SEARCH_PROVIDERS as readonly string[]).includes(value);

/**
 * What an unrecognised stored or configured engine reads as.
 *
 * Tavily rather than a refusal: the column predates the choice, so every row
 * written before it holds a name this list may not have, and a workspace that
 * cannot search at all is a worse answer than one searching with the engine it
 * had before.
 */
export const readSearchProvider = (value: unknown): SearchProvider =>
  isSearchProvider(value) ? value : 'tavily';

/** The engines that spend a search key of their own. */
export const searchProviderNeedsKey = (provider: SearchProvider): boolean =>
  provider !== 'openrouter';

/**
 * What a search is for, by the question being asked rather than by the screen
 * that asked it.
 *
 *  - `research` — collecting supports before or after writing: «Нужен ресерч»
 *    and «Усилить ресерчем». Breadth and accuracy matter; a person reads the
 *    sources and chooses.
 *  - `facts` — checking a claim the text already makes: «Проверить факты
 *    поиском», and every search the product starts on its own while drafting.
 *    A short citable snippet matters more than depth.
 *  - `discovery` — what is new on a subject in a recent window, for the topic
 *    subscriptions in «Откуда идеи». A published-date window matters most.
 */
export const SEARCH_TASKS = ['research', 'facts', 'discovery'] as const;

export type SearchTask = (typeof SEARCH_TASKS)[number];

export const isSearchTask = (value: unknown): value is SearchTask =>
  typeof value === 'string' &&
  (SEARCH_TASKS as readonly string[]).includes(value);

/**
 * What a search is treated as when its caller names nothing and no level was
 * asked for. `facts`, because an unnamed search in this product is one the
 * product started by itself while writing — nobody chose to spend research on
 * it, and `WebResearchService` already refuses to charge the research quota
 * for exactly that case.
 */
export const DEFAULT_SEARCH_TASK: SearchTask = 'facts';

/** An engine per task. Every entry optional: absent means «the workspace's». */
export type SearchTaskProviders = Partial<Record<SearchTask, SearchProvider>>;

/** A stored key per engine. Absent and empty both mean «none saved». */
export type SearchProviderKeys = Partial<Record<SearchProvider, string>>;

/**
 * Long enough for an encrypted key of any engine we know with room to spare,
 * short enough that a paste of a whole file is refused rather than stored.
 * The encrypted form is several times the plain one, so this is not the
 * length of the key a person types.
 */
export const MAX_SEARCH_KEY_LENGTH = 2_000;

/**
 * Read a stored key map defensively.
 *
 * It arrives as a JSON column, so nothing about its shape is guaranteed. An
 * unusable entry is dropped rather than repaired: an engine with no key simply
 * has none, which every reader already handles, while a coerced key is a
 * request the provider rejects far away from here.
 *
 * The values stay exactly as stored — this file never encrypts or decrypts.
 * That belongs to `ai.provider.config.ts`, which owns the one key schedule.
 */
export const parseSearchKeys = (raw: unknown): SearchProviderKeys => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed: SearchProviderKeys = {};
  for (const [provider, value] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!isSearchProvider(provider) || typeof value !== 'string') continue;
    const key = value.trim();
    if (!key || key.length > MAX_SEARCH_KEY_LENGTH) continue;
    parsed[provider] = key;
  }
  return parsed;
};

/** Read a stored task map defensively, on the same terms. */
export const parseSearchTaskProviders = (
  raw: unknown
): SearchTaskProviders => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed: SearchTaskProviders = {};
  for (const [task, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSearchTask(task) || !isSearchProvider(value)) continue;
    parsed[task] = value;
  }
  return parsed;
};

/** The part of a resolved configuration this file reads, and nothing else. */
export interface SearchRouteSource {
  /** The workspace's engine: what a task with no route of its own gets. */
  provider: SearchProvider;
  /** The key for `provider`, for callers that resolve only that one. */
  apiKey?: string;
  taskProviders?: SearchTaskProviders;
  apiKeys?: SearchProviderKeys;
}

/**
 * The key one engine is allowed to spend, and the only way to ask.
 *
 * The map answers for every engine; `apiKey` answers for the workspace's own
 * one and is the same value. Both are read because the map is the newer of the
 * two and a configuration may be assembled by something that only knows the
 * older shape — but neither can answer for an engine it does not name, which
 * is the whole guarantee: there is no expression here that returns one
 * engine's key when asked about another.
 */
export const searchKeyFor = (
  provider: SearchProvider,
  source: SearchRouteSource
): string =>
  source.apiKeys?.[provider] ||
  (provider === source.provider ? source.apiKey || '' : '');

/**
 * The one place a task becomes an engine.
 *
 * An empty map routes nothing, and every task lands on the workspace's own
 * engine — which is exactly what the product did before this file existed. A
 * route to an engine with no key falls back the same way rather than failing:
 * a person who picked Exa for research and has not pasted its key yet should
 * get the search they had, not an error on a button that used to work.
 */
export const providerForSearchTask = (
  task: SearchTask,
  source: SearchRouteSource
): SearchProvider => {
  const routed = source.taskProviders?.[task];
  if (!routed || routed === source.provider) return source.provider;
  if (searchProviderNeedsKey(routed) && !searchKeyFor(routed, source)) {
    return source.provider;
  }
  return routed;
};

/**
 * Everything about a configuration that decides which engine a search reaches,
 * flattened for the client memo keys in `ai.clients.ts`.
 *
 * It lives here for the same reason `roleModelFingerprint` lives beside the
 * roles: the client factories must not have to read a route of their own to
 * build a cache key, or the key becomes the one line that can quietly
 * disagree with the routing.
 */
export const searchRouteFingerprint = (source: SearchRouteSource): string =>
  [
    source.provider,
    SEARCH_TASKS.map(
      (task) => `${task}=${source.taskProviders?.[task] ?? ''}`
    ).join(','),
    SEARCH_PROVIDERS.map(
      (provider) => `${provider}=${source.apiKeys?.[provider] ? '1' : '0'}`
    ).join(','),
  ].join('|');
