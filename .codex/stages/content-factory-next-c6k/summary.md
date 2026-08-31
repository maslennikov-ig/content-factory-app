# Stage Summary: ja3 audit remediation

## Goal

Close every finding of the independent audit of `content-factory-next-ja3`,
which returned `reject` on 3 P1, 8 P2 and 18 P3 findings, and bring the stage
evidence back in line with what is actually provable.

## Scope status

Twelve of the fourteen tracked issues are closed. Two carry explicit deferrals,
recorded as `content-factory-next-c6k.15` and `.16` rather than folded away.

## Observable behavior

- A Telegram connect claim now needs a valid word and is only claimable for 15
  minutes. Previously a request with no `word` at all dropped the Prisma filter
  and returned the oldest pending connection of any organization, which handed
  one tenant publishing rights to another tenant's channel.
- Research sources are readable: the links moved from `cf-accent-ink`, which is
  ink for an accent fill, to `cf-accent` — 5.90:1 light and 6.56:1 dark against
  the surface they actually sit on, up from 1.06 and 1.11.
- An AutoPost rewrite fits its channel. The generated text is published
  verbatim instead of having its line breaks doubled after the budget was set,
  and a post with a picture is budgeted against Telegram's 1024-character
  caption rather than the 4096-character message.
- A failing web search degrades everywhere instead of only when search is
  switched off: the generator, the chat tool and AutoPost all continue without
  research. A hung search is abandoned after 20 seconds.
- A first-time visitor whose browser asks for Russian, or for `ka`, or for
  `pt-BR`, is served that language on the server render.
- One unprocessable Telegram update no longer blocks every later update, and a
  batch is not applied after the lease was lost during the long poll.

## Reversals found by review

The independent review overturned one of the audit's own findings, and the
reversal is kept because the evidence is stronger than the original claim.

`credentials: true` in the backend CORS options had been made conditional again
to match upstream. The review showed CopilotKit hardcodes
`credentials="include"` in three components and never consults `isSecured`, so
a browser would discard those responses whole and every `NOT_SECURED` stack
would lose the AI chat and the agents. The unconditional form is restored, with
the reason recorded in the code and in the test that previously asserted the
opposite.

The review also disproved a fix that had looked done: `RunnableConfig.timeout`
never reaches `TavilySearch`, because `StructuredTool.call` does not race the
abort signal and the tool neither accepts nor forwards one. The deadline is now
an explicit race in the service.

## Verification

The root ran one acceptance set on the finished work:

- `pnpm run build` — exit 0, all three workspaces
- `pnpm test` — 30 suites, 167 Jest tests, 4 Python tests
- `node scripts/branding/brand-scan.cjs` — 0 unexplained, 2202 allowlisted
- `pnpm run docs:check` — 46 files
- `scripts/orchestration/run_process_verification.sh` — OK
- `git diff --check` — clean

Jest was run three times in a row to confirm stability after a race between the
branding fixture and the localization guard was fixed; 167/167 each time.

Independent read-only review by a model that did not own the implementation is
recorded as required for the auth/tenancy category. It returned 3 P2 and 6 P3;
the two confirmed P2 regressions were fixed, the third and four of the P3 items
were fixed, and the remainder are the deferrals below.

## Explicit deferrals

- The consumer lease still expires on the process clock rather than the
  database clock. Prisma cannot express a database-side interval in `update`
  and `AGENTS.md` forbids raw SQL. Re-checking ownership after the long poll
  narrows the window.
- The failed-attempt counter lives in process memory, so a crash loop resets it
  and a deterministically unprocessable update can still hold the cursor.
- Two structural assertions remain, each with its reason in the test: proving
  that no second poller exists cannot be done behaviourally, and one frontend
  wiring check has no behavioural counterpart on this side.
- Two React fixes have no behavioural test: the repository has no jsdom
  harness, and adding one would change `jest.config.cjs` and `package.json`.
- The operator's personal address is in the screenshots and therefore in the
  history of `575404c7`. Deleting the files does not remove it; a history
  rewrite is the owner's decision.

## Boundary

Nothing was committed, pushed, deployed or migrated. No paid model call and no
Telegram publication occurred. The rollback boundary is the clean tree at
`575404c7`.
