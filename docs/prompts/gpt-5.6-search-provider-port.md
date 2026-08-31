Target: ChatGPT (GPT-5.6) with write access to `/home/me/code/content-factory-next`, on a branch off `main`.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Make Tavily the properly configured primary search backend, and add OpenRouter's web plugin as an automatic fallback for when Tavily fails or runs out. The vendor decision is already made; do not re-open it.

Success criteria:

- Tavily is called with `include_raw_content: true` and depth `advanced` by default, with `country` derived from the classifier's `subjectLanguage`/`scope` rather than pinned to one country, and with `time_range`/`topic: news` where freshness is required.
- Raw page text is capped before it reaches any prompt: a per-source and combined-fact-text ceiling, named constants next to `WEB_SEARCH_TIMEOUT_MS`, preferring a paragraph boundary and falling back to a character cut. A measurement on 2026-08-14 found 15k–48k characters per source, five sources per query.
- `SearchProvider` becomes `'tavily' | 'openrouter'`, and the OpenRouter branch uses the web plugin with `engine: parallel` and `mode: advanced`.
- Fallback fires only on failure — 429, exhausted quota, 5xx, timeout, empty results — never on a missing key and never on dissatisfaction with quality.
- The research result records which provider answered, and that is visible in the log and structured source data; a visual source label is a separate task.
- `pnpm run build`, `pnpm test` and `node scripts/branding/brand-scan.cjs` are green, reported verbatim.

Context:

- Read `AGENTS.md`, then `docs/prompts/search-provider-port-spec.md`, which carries the owner's decision, the measured numbers and the file-and-line facts. It is authoritative wherever this prompt is shorter.
- The seam exists: per-organization `WebSearchConfig`, the Prisma columns, a 30-second cache. Only `TavilySearch` at `ai.clients.ts:150` is hardcoded, today with `includeRawContent: false` and depth `basic` — the product chose Tavily for a capability it does not switch on.
- The consumer contract is fixed: `invoke({ query }, { timeout })` answers `{ answer?, results?: [{ title?, url?, content?, published_date? }] }`.
- The fallback exists only for organizations whose model provider is already `openrouter`, because it bills to that same key. An organization on OpenAI has no fallback, and the settings screen must show that state rather than hide it.
- Resolve the OpenRouter plugin's current request and response shape from OpenRouter's own documentation on the day you build, not from memory, and name the page and its date in your report.

Constraints:

- No real call to a search vendor in tests or in the build.
- The total time budget for one research call must not double: primary and fallback each get their own deadline and the sum stays bounded. Do not hand the deadline back to the tool; the reason is in the comment beside it.
- No environment-variable fallback key, no raw SQL, no changes to Temporal or social-provider contracts.
- Do not touch `apps/frontend/src/components/launches/**` or `new-launch/**`: a parallel stream owns them.
- New interface code must pass `tests/design.guard.test.cjs` and `tests/design.contrast.test.cjs`: `cf` tokens only, no hex literals in JSX.
- Tests must cover two-organization isolation, search disabled, a missing key per provider, the deadline firing, each failure condition that triggers fallback, and the truncation boundary.

Output: what changed by file, one line each; the OpenRouter documentation page and date; the verbatim result of each verification command; the ceilings you chose for raw text and why; what you deliberately did not do; assumptions listed as assumptions.

Stop: Stop when the branch builds, tests pass and the report is written. Do not merge, push to `main`, deploy, or connect a real key. If OpenRouter's documented shape cannot satisfy the consumer contract, stop and report that rather than shipping an adapter that silently drops `content`.
