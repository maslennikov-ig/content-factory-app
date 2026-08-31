Target: ChatGPT (GPT-5.6) with write access to `/home/me/code/content-factory-next`, running unattended overnight.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Land four independent pieces of work, each on its own branch and its own commit: remove the Solana wallet login, bring `global.scss` onto the documented scale, finish migrating the OAuth authorize page, and add Telegram login over OpenID Connect.

Success criteria:
- Four branches off `main`, one commit each, in this order: `codex/drop-wallet-login`, `codex/global-scss-scale`, `codex/oauth-authorize-tokens`, `codex/telegram-login`.
- After each task, all of `pnpm run build`, `pnpm test`, `node scripts/branding/brand-scan.cjs` and `bash scripts/orchestration/run_process_verification.sh` are green before the next task starts.
- Nothing in the payment subsystem changed, and `libraries/react-shared-libraries/src/translation/locales/**` is touched only to add keys the fourth task introduces.

Context:
- Read `AGENTS.md`, then `docs/prompts/telegram-login-spec.md` for task 4. Beads epic `content-factory-next-we2` holds all four with acceptance criteria; run `bd show <id>` for each.
- Task 1 — `node_modules/@solana/wallet-adapter-react-ui/styles.css:1` imports a font from `fonts.googleapis.com` and reaches the login route through `components/auth/login.tsx:16` → `auth/providers/wallet.provider.tsx:43`. The wallet button never renders: it sits behind `billingEnabled = !!STRIPE_PUBLISHABLE_KEY` and no Stripe key exists. Delete the login provider on both sides, its two frontend files, the branch in `login.tsx` and `register.tsx`, the registration in `api.module.ts`, then the two `@solana/wallet-adapter-*` packages once the build proves nothing else needs them. Keep the `WALLET` value in the Prisma enum. Lock it with a test that the built CSS carries no `fonts.googleapis`.
- Task 2 — five values off the documented scale in `apps/frontend/src/app/global.scss`: radii `50px` (`.box:after`, ~163), `3px` (`.react-tags__tag`, ~293), `6px` (react-tags listbox, ~369), and font sizes `20px` (`.wmde-markdown`, ~428; `.ProseMirror h2`, ~747). `DESIGN.md:217` allows 4/8/12 and a true pill and bans 24 and above; the type scale has 24 and 18 but no 20. Add a check that a new off-scale value cannot reappear.
- Task 3 — `apps/frontend/src/app/(app)/oauth/authorize/page.tsx` still carries five hex literals, four `text-white`, five `text-gray-400`, `bg-red-500/20`, `text-red-500`, six `blur-[120px]` blocks and `rounded-[16px]`; `layout.tsx:14` carries `bg-[#0B0A0A]`. The design guard's registry is two-way, so you must also delete `tests/design.guard.test.cjs:54`, `:104` and `:53` — a file that stops offending must leave the list or the suite fails from the other side.
- Task 4 — full contract in the spec. The backend model to copy is `apps/backend/src/services/auth/providers/oauth.provider.ts`, which is already an OIDC client.

Constraints:
- Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` only; never npm or yarn.
- Do not touch payments: `billingEnabled`, Stripe, `Subscription`, `Credits`, `pricing.ts`, tiers. The wallet is a way to log in, not a way to pay.
- Do not work on or merge `codex/i18n-complete-locales`; another run owns it. Any string task 4 adds must go into all sixteen locale files in the same commit, or the locale guard on that branch turns red.
- No real Telegram, Solana or vendor call in tests or in the build. No secret in the repository, in a prompt, or in a command argument.
- New interface code uses `cf` tokens only, no hex literal in JSX, and must pass `tests/design.guard.test.cjs` and `tests/design.contrast.test.cjs`.

Output: per task, what changed by file, the verbatim result of each verification command, and the branch and commit hash. Then one list of everything you deliberately did not do, and one list of anything you could not finish with the reason.

Stop: Do not stop for permission — commit each finished task on its own branch and keep going. Never push, never merge into `main`, never deploy, never spend the workspace model key, never register anything in BotFather. If a task cannot be finished, write down where it stopped and why, leave that branch as it is, and start the next one; do not abandon the remaining tasks because one failed. The live Telegram login cannot be tested without a registered domain — build it, test it against fakes, and record the live check as deferred rather than waiting for it.
