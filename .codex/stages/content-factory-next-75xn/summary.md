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

## Correction after the owner's walk, same day

He reached stage C and stopped. Three remarks; one of them was a defect of mine
worse than what he could see.

**P1 (`75xn.10`).** The compatibility shim read the superseded `searchApiKey`
column as belonging to whichever engine `searchProvider` currently named. That
column is editable, so a workspace whose key had been saved for Tavily and whose
engine was then switched to Exa would have had its Tavily key sent to
`api.exa.ai` — the leak this epic exists to prevent, walked back in through its
own shim. What he saw was the milder end: his Tavily key went unreachable and
the lane switched itself off. The column is no longer read; rows are migrated
once, while `searchProvider` still names the engine the key was saved for.
Production had exactly one such row, already switched, so he named its engine.

**The deliberate deviation was reversed by the owner (`75xn.11`).** Shipping no
implicit routing was my call; he read the screen — a recommendation printed
directly above the question it was asking — and said so plainly. Routing now
decides by itself. The last resort had to change with it: with nobody setting
the workspace engine, falling back to that column would refuse a search a
workspace holding only an Exa key can plainly afford, so the floor became «an
engine there is a search key for». OpenRouter stays out of that floor — it
answers with the generation key, and `tests/web.research.service.test.cjs`
caught the first version reaching for it.

**The screen was the product's least consistent, and he listed why.** No card
where its three neighbours have one; the card geometry hand-written five times
while a shared `Panel` sits unused in settings; explanations in a 62ch column
in a narrow panel; a `Hint` component used 25 times elsewhere and never here; a
Save button where its neighbours save themselves, with a clear-key control that
bypassed it anyway; and a select chevron at 12px beside a clear mark at 22.
All of it is one section component, one declared inset, autosave for everything
but a key, and hints for what is reference rather than state.

Keys: on his instruction («перенеси сам, я его не помню») his own model and
Tavily keys were decrypted inside the container and written into the host's
included slots. Included mode answers for the first time.

Released as `616fe17a2380`; schema unchanged.
