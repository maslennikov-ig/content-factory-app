# Search epic 13.09: keys per engine, provider per task, working system keys, topics

Owner's own question opened it — «если я вставлю ключ Exa, ключ Tavily не
потеряется?» — and the answer was no, it does not, by design: one `searchApiKey`
column forced a defence that wiped the stored key whenever the engine changed.
Owner then reversed the 10.09 decision «two engines at once are not needed»,
authorised both waves together, authorised placing production keys on the host,
and set a temporary included allowance of 50 operations a month pending `or3.9`.

Rollback `17088939db40`. Streams: root owned the provider configuration, the
client port, the research service and the usage ledger; two isolated worktrees
owned the settings screen and the topic subscriptions. Both merged at root.

Implementation: `ai.search-tasks.ts` is importless beside `ai.roles.ts` and is
the only file that turns a task into an engine or an engine into a key. Three
nullable columns: `AiProviderSetting.searchApiKeys`, `.searchTaskProviders`,
`ContentLeadSubscription.query`. Older rows read through the single-key fallback,
so no data migration is needed.

Two defects found on the way and fixed here, neither of them in the plan:
P1 — saving settings in `included` mode wrote the operator's engine into the
workspace's own column, so a workspace returning to its own key came back
pointed at someone else's API; and the first version of the dormant-key line
carried the decrypted tenant key into an `included` configuration, caught by
`tests/ai-provider.usage-mode.test.cjs` rather than by review.

Deliberate deviation from the plan: no implicit default routing. The plan had
`research` fall to Exa whenever an Exa key exists; shipped behaviour routes
nothing until a person says so, because a release that silently moves every
workspace's research to another engine is a change nobody asked for. The screen
carries the recommendation in words instead.

docs-reviewed: updated - configuration, outbound connections, tariff levers,
third-walk specification §6, content section map, both env examples.
graph-reviewed: no-change-needed - no new subsystem boundary; the two new files
sit beside their siblings (`ai.roles.ts`, `lead-feed.gateway.ts`) and are
reached through the same callers.
project-index: reviewed-no-change
