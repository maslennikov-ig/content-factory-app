Target: ChatGPT (GPT-5.6) with write access to `/home/me/code/content-factory-next`, on branch `codex/i18n-complete-locales`.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Finish the interface translation catalogue. 3312 strings are missing across ten languages, and one test names exactly which. Translate them and make that test green.

Success criteria:
- `node scripts/i18n/collect-ui-keys.cjs` reports `не хватает 0` for every one of the sixteen locales.
- `npx jest tests/branding.test.cjs` passes, including `translates every string the interface renders, in every locale`.
- `pnpm test`, `pnpm run build` and `node scripts/branding/brand-scan.cjs` are green, reported verbatim.
- No translation that already existed was changed, and no locale file lost a key.

Context:
- Read `AGENTS.md` first, then run `node scripts/i18n/collect-ui-keys.cjs`. Its output is the authoritative worklist: it parses the TypeScript syntax tree of `apps/frontend/src`, so it sees every screen, not a maintained list.
- English is complete and is the source text. Arabic, Bengali, German, Spanish and French are done. Hebrew needs 120, Russian 200, and Italian, Japanese, Georgian, Korean, Portuguese, Turkish, Vietnamese and Simplified Chinese need their full set.
- `node scripts/i18n/export-missing.cjs --out DIR --chunk 200` writes the missing strings as `locale.json` / `locale.NN.json` files of `key → English text`. Work from those.
- `node scripts/i18n/merge-translations.cjs FILE...` is how the result gets in. It refuses a value that lost a placeholder, translated the product name, came back empty, or answers a key the interface does not render, and it never overwrites an existing translation. Put your translated files next to the exported ones under the same names and merge them; do not hand-edit `translation.json`.
- Six keys are deliberately absent from every locale and the test asserts that exact list: `are_you_sure_revoke_access`, `channel_connected_description`, `no_matching_integrations`, `refund_selected_confirm`, `select_the_page_or_account`, `switch_user_confirm`. Their English text is assembled at runtime from a JavaScript value. Do not add them.

Constraints:
- Translate every key you are given; never drop or invent one.
- These are labels, buttons, headings and short messages. Keep them near the English length and in the register software uses, not prose.
- Keep every placeholder byte-identical, braces and inner name included: `{{count}}` stays `{{count}}`.
- Never translate `Content Factory`, other product and network names (Tavily, OpenRouter, OpenAI, Telegram, LinkedIn, Mastodon, TikTok and so on), HTML tags, URLs, code identifiers, prices or currency codes.
- Write each language in its full orthography, every diacritic and accent included. Never substitute an accented character with a plain one.
- Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` only; never npm or yarn.
- Touch `libraries/react-shared-libraries/src/translation/locales/**` and nothing else. Do not change `scripts/i18n/**`, the test, or any component.
- Do not paste an API key anywhere, and do not spend the workspace model key: `scripts/i18n/translate-locales.cjs` exists but is not part of this task.

Output: how many strings you added per language; whatever `merge-translations.cjs` rejected and what you did about it; the verbatim result of each verification command; ten sample translations per language that you checked yourself, with the English beside them; anything you deliberately left undone.

Stop: Stop when the guard is green and the report is written. Do not commit, merge, push, deploy or open a pull request. If a string cannot be translated without breaking it — an unsplittable placeholder, a term with no equivalent — leave it, list it, and say why rather than shipping a guess.
