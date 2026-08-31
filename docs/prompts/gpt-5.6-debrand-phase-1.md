Target: ChatGPT with write access to `/home/me/code/content-factory-next`, on branch `codex/debrand-phase-1`. A smaller model is fine: every step here is mechanical.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Remove the upstream brand from the four places where removing it is safe, and leave every place where removing it is not. Work one category at a time, verify, commit, then move to the next.

Success criteria:
- Four commits on `codex/debrand-phase-1`, one per category, in the order below.
- `node scripts/branding/brand-scan.cjs` still reports `0 unexplained reference(s)` after each commit, with a lower allowlisted count than before.
- `pnpm test` and `pnpm run build` are green after each commit.
- No locale lost a key in any of the sixteen languages.

Context:
- `node scripts/branding/brand-scan.cjs` is the inventory. Beads task `content-factory-next-wcx` holds the full breakdown; run `bd show content-factory-next-wcx`.
- Category 1 — environment keys. `POSTIZ_GENERIC_OAUTH` in `apps/frontend/src/app/(app)/layout.tsx:107`, `(extension)/layout.tsx:46`, `(provider)/layout.tsx:48`, `apps/frontend/src/proxy.ts:124`; `POSTIZ_API_KEY` in `apps/frontend/src/components/public-api/public.component.tsx:393`. Rename to a `CONTENT_FACTORY_*` equivalent and update `.env.example` and any docs that name them. No deployment of this product exists, so nothing downstream breaks.
- Category 2 — the deep-link scheme. `apps/backend/src/api/routes/auth.controller.ts:208` defaults to `postiz://auth/callback`; a comment repeats it at `apps/frontend/src/components/launches/add.provider.component.tsx:474`. `apps/` holds backend, commands, extension, frontend, orchestrator and sdk — there is no mobile shell in this repository, so the scheme is not registered with any operating system here.
- Category 3 — eight translation keys whose *names* carry the brand; their values are already rebranded. `connect_your_mcp_client_to_postiz_to_schedule_your_posts_faster`, `faq_am_i_going_to_be_charged_by_postiz`, `faq_can_i_trust_postiz`, `faq_can_i_trust_postiz_gitroom`, `faq_postiz_gitroom_allows_you_to_schedule_posts`, `faq_postiz_gitroom_is_proudly_open_source`, `faq_to_confirm_credit_card_information_postiz_will_hold`, `use_postiz_api_to_integrate_with_your_tools`, `webhooks_are_a_way_to_get_notified_when_something_happens_in_postiz_via_an_http_request`. Rename each in the calling code and in all sixteen files under `libraries/react-shared-libraries/src/translation/locales/` in the same commit.
- Category 4 — `apps/frontend/src/components/public-api/public.component.tsx:374` shows `npm install -g postiz`. That is the upstream command-line tool, which this product does not ship. Remove that snippet and the surrounding instruction rather than renaming it.

Constraints:
- **Never touch these. Removing them breaks the licence.** `README.md:5` (the link to `gitroomhq/postiz-app` as the basis), `README.md:56` and `:58` (the AGPL statement and the trademark notice), the `LICENSE` file, and any copyright header. This product will be published under AGPL, which requires the attribution to stay.
- **Never touch these without a separate decision.** They are persisted identifiers, and renaming orphans stored data: the Mastra agent id and name `postiz` and `agent="postiz"` (`libraries/nestjs-libraries/src/chat/load.tools.service.ts:51-52`, `mastra.service.ts:17`, `start.mcp.ts:36,45`, `components/agents/agent.chat.tsx:71`), the store id `postiz-store` (`mastra.store.ts:4`), `featured_by_gitroom` (`subscriptions/pricing.ts`), and the generated organisation e-mail domain `@postiz.com` (`organizations/organization.repository.ts:42`).
- **Never touch this one either.** `TUMBLR_USER_AGENT = 'Postiz/1.0 (+https://postiz.com)'` (`integrations/social/tumblr.provider.ts:19`) may be tied to the application registration on Tumblr's side.
- Leave `@postiz/wallets` alone: another task removes the wallet login and takes it along.
- The import-alias rename already happened on 2026-08-14: imports are `@contentfactory/*` and no workspace package carries the upstream brand in its name. If you find a stray `@gitroom/` outside this document and the prompt that describes that migration, it is a genuine leftover — rename it and say so.
- Node `22.23.2` and pnpm `10.6.1` only; never npm or yarn.

Output: per category, the files changed and the verbatim `brand-scan`, `pnpm test` and `pnpm run build` results, plus the allowlisted count before and after. At the end, the four commit hashes.

Stop: Do not stop for permission — commit each category and continue. Never push, never merge into `main`, never deploy. If a category cannot be completed, leave it uncommitted, write down what blocked it, and start the next category. If any verification goes red, revert that category's changes and report it rather than committing red.
