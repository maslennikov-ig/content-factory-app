# Retained-locale completion supplement

Base: `57d97016cd9c2dea10a554290feb24c82e817127`, branch `codex/dbxe-completion-frontend-20261011`.

Root release review identified six frontend recovery keys missing from fourteen retained locales. The current-worktree collector reproduced exactly 84 gaps; root confirmed its release-candidate gap map had the same six keys. Added concise native-language translations for auth request, calendar/media read, and post/media/channel deletion failures in `ar`, `bn`, `de`, `es`, `fr`, `he`, `it`, `ja`, `ka_ge`, `ko`, `pt`, `tr`, `vi`, `zh`. Existing entries and `en`/`ru` files were preserved, verified by comparing parsed dictionaries with the base commit. No source behavior or test changes.

## Focused evidence

Environment: Node `v22.23.2`, pnpm `10.6.1`, existing shared dependency symlink.

- Red: `pnpm exec jest tests/branding.test.cjs --runInBand --silent` exited 1, with 1 failed / 11 passed / 12 total. Original failure: every rendered key must be translated in every locale. `locales-red.log` records all 84 missing entries.
- Green: identical command exited 0, 12 passed / 12 total, no skips (`locales-green.log`).
- Affected locale check: the repository collector found 1406 rendered keys, 16 locales, zero missing values, zero interpolated keys. Parsed base/current comparison proved precisely six additions per affected locale (84 total), no changed existing translations, and no additions to en/ru (`locales-coverage.log`). Exit 0.
- `git diff --check`: exit 0. Final affected-source digests: `locales-inputs.sha256`.

Documentation/graph: this supplement changes locale values only; existing component-inventory and graph-reviewed result remain applicable. No component or call relationships changed; no graph refresh required.

Acceptance limits: focused local locale coverage/branding evidence only. The root owns full-suite acceptance of the integrated candidate; this stream ran no full suite, live account, provider, email, model, or production action. Translation wording has not received an independent native-speaker review.

Safe cleanup: worktree and branch retained for root integration; no deletion, push, deployment, central tracker/handoff edit, or release-worktree edit. No new runtime or dependency installation.
