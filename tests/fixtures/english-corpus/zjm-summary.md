# Stage Summary: Content Factory brand and interface

> Terminology amendment (2026-08-14): exact upstream namespace spelling was
> removed after `content-factory-next-wcx.1` migrated imports. Acceptance status,
> counts and evidence below are otherwise unchanged.

## Goal

Turn the user-facing interface of the Postiz fork into Content Factory: one
editorial design language, one brand, unchanged behaviour, and untouched
upstream attribution.

## What the stage changed

### Brand boundary first

`scripts/branding/brand-scan.cjs` walks the surfaces a person can see and
classifies every `Postiz`/`Gitroom` occurrence as user-facing brand, legacy
contract or upstream attribution. It never asserts zero occurrences.
`tests/branding.test.cjs` fails the build on anything the allowlist does not
explain. The first run reported **377 unexplained references**; the accepted run
reports **0 unexplained, 2135 explained**.

Explained categories: legacy upstream module aliases, `POSTIZ_*` environment keys,
the `postiz://` deep-link scheme, the AGPL corresponding-source link, third-party
npm/CLI package names, i18n keys that contain an actual underscore, and explicit
file-scoped entries with reasons. Compatibility-sensitive Mastra agent/store ids
are file-scoped rather than accepted by a global `name: 'postiz'` rule, so the
same value in an arbitrary display-name field fails the scan. Other scoped cases
include the Tumblr User-Agent, CopilotKit agent id, `featured_by_gitroom`, the
persisted synthetic `@postiz.com` e-mail domain, an upstream behaviour comment
and the README licence sentence.

Two blind spots found after the first acceptance were closed. The scan now also
walks `apps/orchestrator/src` and `libraries/nestjs-libraries/src/chat`, where a
digest e-mail subject and the MCP server display name were still the old brand.
And because the product name transliterated into another script is invisible to
an ASCII pattern, the scan additionally checks every locale value whose English
source names the product: the name is never translated, so a localised value that
lost it is either a leftover brand or a lost name. That check found the Bengali
FAQ answer.

### Design foundation

- `apps/frontend/src/app/colors.scss` now defines a semantic `--cf-*` layer from
  `DESIGN.md` and maps **every** inherited `--new-*` and `--color-custom1…55`
  variable onto it. Screens that have not been rewritten still render in the
  editorial palette; new components never touch the legacy names.
- Platform preview colours (LinkedIn, Facebook, Instagram, TikTok, YouTube) are
  deliberately _not_ bridged — a preview must keep looking like the platform.
- Tailwind exposes the semantic layer as `cf-*` colours plus `duration-state`,
  `rounded-cf` and sidebar spacing. The `loginBox`/`loginBg` marketing
  backgrounds were removed.
- The global `outline: none` reset is gone. One `:focus-visible` ring, one
  variant for the dark navigation, one skeleton treatment, and a global
  `prefers-reduced-motion` block replace it.
- 34 files of inherited purple/magenta hard-codes were mapped to semantic roles;
  `text-white` on accent surfaces became `text-cf-accent-ink` so dark theme keeps
  its contrast. Decorative blurred colour blobs and gradient CTAs were removed.
  This sweep was incomplete at first acceptance and was finished in the
  post-review pass below.

### Typeface

The inherited Plus Jakarta Sans was replaced by **Geologica** (SIL OFL 1.1,
variable), vendored under `apps/frontend/src/styles/fonts/geologica/` with
provenance and SHA-256 in its `SOURCE.md`. Two reasons, recorded in
[ADR-0007](../../../docs/adr/0007-product-typeface-geologica.md): Plus Jakarta
Sans has no Cyrillic, so Russian fell back to a system font and RU/EN were set in
different faces; and it is one of the faces every current web product has
converged on, which works against ADR-0006. Only the `wght` axis is varied. The
interface uses no italic, so the second inherited font file is gone.

The strings this stage introduced were also translated into Russian, and the
`Agent` navigation label became translatable instead of hard-coded English.

### Brand assets

`CfMark` is an original geometric CF monogram (open ring + two-bar F on an accent
tile, the middle bar in the ochre signature). `Wordmark` pairs it with the
product name set in the repository's own Geologica — nothing rasterised.
`scripts/branding/generate-brand-assets.cjs` renders `icon.svg`, `icon-32/192/512`,
`apple-icon`, `favicon.ico` and `opengraph-image.png` from the same geometry, plus
the two extension icons, so the marks cannot drift. The generator points
fontconfig at the vendored font directory before loading `sharp`: the renderer
ignores an `@font-face` inside the SVG and would otherwise set the social image
in whatever system font it found.

Removed: `postiz.svg`, `postiz-text.svg`, `postiz-fav.png`, `logo.svg`,
`logo-text.svg`, `magic.svg`, `favicon.png`, `public/auth/**` (login artwork and
17 testimonial avatars), `testimonial.tsx`, `testimonial.component.tsx`,
`testomonials.tsx`, `logo-text.component.tsx`.

### Auth

Two-column shell: compact form on a surface panel, and a factual four-step
workflow overview on the right. The "Over 20,000+ Entrepreneurs use Postiz"
wall and the testimonial marquee are gone. Google sign-in renders only when
`YOUTUBE_CLIENT_ID`/`SECRET` are configured. Google, GitHub and generic OAuth use
`AuthProviderButton`; the vendor-backed Farcaster and adapter-backed Wallet
controls import the same shared class and are also real `<button>` elements.
At 401px and below each provider takes a full row, preserving every visible
label. Terms and privacy links come from `NEXT_PUBLIC_TERMS_URL` /
`NEXT_PUBLIC_PRIVACY_URL` and stay hidden until an operator publishes them — no
legal text was invented.

### App shell

The 80px icon-only rail became a signed 248px sidebar with `Work` and
`Administration` groups, a 72px collapsed state (cookie-backed), a forced compact
rail between 768px and 1024px, and a below-768px drawer with a focus trap,
Escape-to-close and focus return. A skip link targets `#cf-main`. Roles, billing
gates, organization selector, theme, language, notifications and routes are
unchanged. The organization picker became a keyboard-reachable menu; the theme
toggle became a labelled `aria-pressed` button; the affiliate link to
`affiliate.postiz.com` was removed as an upstream product link.

Light is now the default theme, resolved server-side from the `mode` cookie so
the first paint is correct.

### Surfaces

Calendar toolbar wraps instead of colliding; week and month grids keep a minimum
column width and scroll horizontally instead of crushing seven columns; the
channels rail and the settings rail stack above the content below 768px. Settings
tabs are buttons with `aria-current` and a flat accent marker instead of a purple
gradient bar. The billing wall, FAQ accordion, onboarding, public API, developer,
preview and provider surfaces were rebranded and moved onto the semantic layer.
OAuth authorize is rebranded and partly tokenised; its remaining hard-coded dark
surface treatment is the bounded defer `content-factory-next-vzz`. Product
e-mails, Swagger title, Sentry app names and provider error messages now say
Content Factory.

### Configuration

New, all optional and all defaulting to "hidden": `NEXT_PUBLIC_TERMS_URL`,
`NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_DOCS_URL`,
`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_DUB_REFER_DOMAIN`,
`AGENCY_REVIEW_EMAIL`. The Chrome Web Store link and the extension's allowed
origins now follow `EXTENSION_ID` and the extension manifest instead of a
hard-coded Postiz listing.

## Evidence

Run on Node `22.23.2` and pnpm `10.6.1`.

- `node scripts/branding/brand-scan.cjs` — 0 unexplained, 2135 explained.
- `pnpm exec jest tests/branding.test.cjs tests/foundation.test.cjs` — 17 passed
  (14 at first acceptance; the second review added the locale-coverage guard, the
  negative `upstream` fixture and the bridged-contrast guard).
- `pnpm run build` — frontend, backend and orchestrator built.
- `pnpm test` — 17 Jest tests and 4 Python orchestration tests passed. (This line
  read "14 Jest tests" until a later review corrected it: Jest's `roots` is
  `tests/`, so `pnpm test` runs exactly the two files above and cannot report a
  different number than the 17 on the previous line. 14 was the count before the
  second review added its three guards.)
- `git diff --check` and `git diff --cached --check` — clean.
- `scripts/orchestration/run_process_verification.sh` — passed.
- `python3 scripts/orchestration/check_stage_ready.py content-factory-next-zjm`
  and `python3 scripts/orchestration/lint_stage_sizing.py --stage
content-factory-next-zjm --json` — both pass.
- Extension: `pnpm --filter ./apps/extension exec vite build` compiles and the
  emitted `dist/manifest.json` is byte-identical to the source manifest and names
  Content Factory. Packaging is **not** verified: `pnpm run build:extension`
  fails at `zip -r ../extension.zip .` because `zip` is not installed here, and
  no `extension.zip` was produced. The prerequisite is written up in
  `docs/development/local-development.md`; nothing was installed.
- Browser smoke against a locally running frontend (`:4200`) and backend
  (`:3000`): `screenshots/` holds auth 1440 light, `/launches` 1440 light,
  1440 dark, 1024 light and 390 dark, the same route in Russian at 1440 and 390,
  the 390 navigation drawer, the focus ring on the dark rail, settings 1440
  light, media and integrations 1440 dark, and login/register at 390 with Google,
  Farcaster and Wallet all visible. The provider run used placeholder values for
  `YOUTUBE_CLIENT_ID`, `NEYNAR_CLIENT_ID` and `STRIPE_PUBLISHABLE_KEY` so all
  three routes render; no button was clicked and no OAuth call was made. At
  390px all three measured 342px wide with no horizontal overflow; Google and
  Farcaster were keyboard-focusable buttons, while Wallet correctly remained a
  disabled button until its adapter became ready.
- The Russian screenshots are the check that matters for the typeface: interface
  and product name are now set in one face instead of splitting across a system
  fallback.
- No page-level horizontal overflow at 1024px or 390px
  (`document.documentElement.scrollWidth === clientWidth`).

## Boundaries respected

No push, no deploy, no real OAuth or social connection, no live publication, no
paid model call, no user messaging. No business logic, provider, capability or
AI/model call was added. Legacy upstream imports, legacy environment keys,
Prisma/Temporal/provider identifiers, OAuth parameters and public API contracts
are unchanged. `LICENSE`, copyright, AGPL source obligations, the `upstream`
remote and historical ADRs/stages were untouched by that stage.

## Post-acceptance correction

A review after acceptance found process, brand, UI and reporting gaps in the
uncommitted tree. They are tracked as `content-factory-next-ers` and fixed here:
the stage gained the goal-level scope anchor its manifest was missing and
`.codex/orchestrator.toml` moved off the historical `6vk` paths, so both stage
gates pass; three legacy-brand leaks outside `apps/frontend` were closed and the
scan widened to cover them; two hard-coded purple hover colours became
`cf-accent-hover`; the auth provider row wraps and the wallet control joined the
shared shape instead of a white 52px box that hid its own label below 401px; a
final independent pass made Farcaster and Wallet real buttons, stacked every
provider to full width below 401px, narrowed compatibility allowances to exact
files, and added a negative scanner fixture for a generic legacy display name;
the handoff and project index now point at the accepted current stage and mark
the implementation prompt as historical; and `ka_ge/translation.json` was
rebuilt on its original formatting, so its diff is 10/12 lines like every other
locale instead of 504/506.

## Second independent review and correction

A second read-only review of the same tree, tracked as
`content-factory-next-quf`, found that two claims above were not true of the
code and that one defer was far smaller on paper than in reality. All of it is
fixed here.

**Contrast.** The accent sweep was much less complete than this artifact
claimed, and the miss was systematic: it only looked for the literal
`bg-cf-accent`, while most call sites reach the same colour through the
compatibility bridge as `bg-btnPrimary`, `bg-forth` or `bg-seventh`. Two
separate failures fell out of that.

In the **dark** theme `--cf-accent` is the light `#74ae8b`, so every `text-white`
left on it measured 2.57:1: the channel-settings header, its two icons and the
schedule arrow in `manage.modal.tsx`; the label and plus glyph in
`add.post.button.tsx`; the checkmark in `tags.component.tsx`; the primary
Create-post and Start-a-chat buttons in `new.post.tsx` and `agent.tsx`; the
calendar's post-now strip; the media toolbar's active and hover states; two
buttons in `media.settings.component.tsx`; the impersonation banner; and an
admin-stats filter. They now use `text-cf-accent-ink` (6.55:1) or inherit it
through `currentColor`.

In the **default light** theme the same class of leak made text disappear
outright: the composer's two lock overlays in `editor.tsx` printed white on
`--cf-surface-subtle` under a 19%-alpha wash (1.71:1); the selected day in
`date.picker.tsx` was white on `--cf-accent-soft` (1.15:1); the public
preview's comment box in `comments.components.tsx` was white on white (1.00:1);
the provider WebView bridge inherited `text-white` onto `bg-cf-canvas`; the
thumbnail back button turned white on hover over a light panel; and the
thumbnail Cancel button carried `bg-gray-600`, which this Tailwind config does
not generate at all, so it had no background to sit on. Each now uses the role
that fits — `text-cf-ink`, `text-cf-accent`, or a real surface pair — and every
replacement measures at least 5.3:1 in both themes.

`tests/foundation.test.cjs` now resolves every Tailwind alias through the bridge
to a literal hex per theme and fails on any `text-white` beside a `bg-*` alias
below 4.5:1, so this specific blind spot cannot reopen.

**Localisation.** The `zjm.5` defer described two onboarding strings. The real
gap was 42 keys introduced by this stage, present only in `en` and `ru`, so the
other 14 locales silently rendered the English inline defaults across the
sidebar groups, the skip link, the whole auth overview, the onboarding steps and
the billing headings. On top of that, five strings the stage rewrote —
`account_not_activated`, `resend_activation_email`, `sign_in_with_google`,
`watch_tutorial_title`, `watch_tutorial_description` — existed only as inline
defaults and were in **no** bundle at all, English included. All are now
translated in all 16 locales, and `ka_ge` gained the 12 further auth/onboarding
keys it had never had. `tests/branding.test.cjs` now extracts every
`t('key', …)` call from the sixteen rebuilt surfaces and fails if any locale is
missing one, so this cannot drift back silently.

**Scanner.** The `upstream-source-attribution` rule accepted any line containing
the word `upstream`, which would have explained away a visible string that
merely mentioned it. It is now limited to the `gitroomhq/postiz-app` reference;
the one piece of prose that needed it — the trademark notice in `README.md` — is
an explicit file-scoped entry, and a negative fixture asserts that
`Syncing upstream from Postiz failed` still fails the scan.

**Robustness and hygiene.** `new URL(process.env.MAIN_URL)` in the root layout
ran unguarded, so a malformed value would have thrown during SSR and taken every
route down; it is now a guarded helper that simply yields no analytics host.
`billing_join_over`, `billing_entrepreneurs_count` and `billing_who_use` became
unused when the billing wall was rewritten and were dropped from all 16 bundles.

**Outbound values, recorded rather than reverted.** The rebrand also changed two
values this product sends to third parties: `utm_source` for Beehiiv
(`gitroom_platform` → `content_factory`) and the Mastodon app `client_name`.
Both are correct for a renamed product, but an existing deployment will see its
Beehiiv attribution split at the cutover, and a Mastodon app registered after
the change shows the new name in the user's authorised-apps list. Stored
credentials and existing registrations are unaffected.

## Bounded defers

- `content-factory-next-lse` — `externally_connectable.matches` in the extension
  manifest lists only localhost. Content Factory has no production origin yet, so
  no exact origin can be added and a wildcard would accept messages from any
  site. Blocked on a product-owner decision, not on code.
- `content-factory-next-vzz` — the OAuth authorize surface is migrated only
  partly: its accent and signature use `cf-*` tokens, but the card, the Deny
  button and the dividers are still hard-coded `#1A1919`/`#2A2929`/`#3A3939` with
  `text-white`, and the background keeps decorative `blur-[120px]` blobs that
  `DESIGN.md` forbids.

Assessed and not deferred: `AGENCY_REVIEW_EMAIL` falls back to
`EMAIL_FROM_ADDRESS` and then to an empty recipient. With no `EMAIL_PROVIDER`
configured the empty provider swallows the send, the variable is documented in
`.env.example`, and the agency review flow is an opt-in upstream surface, so this
does not affect the next stage.

docs-reviewed: updated — README, `.env.example`, handoff, ADR-0007 and its index
entry, the interface specification, `docs/development/local-development.md` (the
`zip` prerequisite and the compile-versus-package split) and this artifact match
the shipped behaviour; `PRODUCT.md`, `DESIGN.md`, ADR-0006 and the interface
specification were already the contract this stage implements, and `DESIGN.md`
gained the `border-control` token the 3:1 control-boundary rule needs. The
second review corrected two statements in this artifact that the code did not
support — the accent-surface contrast claim and the size of the `zjm.5` defer —
and both now describe what actually shipped.

graph-reviewed: updated — `graphify update . --no-cluster` rebuilt the local
index on the corrected tree (6134 nodes, 17074 edges) in extraction-only mode.
`GRAPH_REPORT.md` was left unchanged and is therefore stale: it still reports
6078 nodes / 14830 edges from commit `ac3b868d`, because it is a clustering
artifact and regenerating it needs an LLM backend this stage had no authority to
call. `graph.json` is the current one; `graphify-out/` stays Git-ignored.

documentation-decision: `docs-resolve` was run for `next@16.2.6` metadata,
viewport, icons and manifest behaviour; L1 reported `fallback-needed`, so the
answer came from Context7 (`/vercel/next.js`, App Router `generateMetadata` and
`MetadataRoute.Manifest`). `docs-persist` reported the L1 store already covers
`next@16.2.9`. Everything else follows repository truth.
