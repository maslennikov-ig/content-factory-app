---
schema_version: orchestration-artifact/v3
task_id: content-factory-next-ry5.2.frontend
stage_id: content-factory-next-ry5.2
stage_manifest: .codex/stages/content-factory-next-ry5.2/stage-manifest.json
stream_owner: newsletter_frontend
repo: content-factory-next
branch: work/newsletter-subscription
base_branch: main
base_commit: 04f9f6d7dfc137e6b960b629f86a59c38b980d01
worktree: /tmp/cf-newsletter
orchestration_level: inner_loop
scope_kind: product_slice
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the delivered files and focused evidence in the shared assigned worktree. No child branch, temporary worktree, browser, external action, or runtime resource existed to clean up.
risk_level: medium
verification_tier: inner_loop
risk_tags:
  - auth
  - ui
  - accessibility
affected_surfaces:
  - ui
  - api
invariants:
  - consent-default-false
  - synthetic-identity-exclusion
  - test-matrix
verification:
  - Focused TDD RED under Node 22.23.2 and pnpm 10.6.1 produced 5 expected failures because the checkbox, explicit boolean payload, and locale key did not exist.
  - Focused TDD GREEN passed 1 suite and 5 tests.
  - Final focused UI, design, foundation, typography, locale-key, locale-translation, and i18n-literal guards passed 8 suites and 57 tests.
  - Review correction RED passed 8 tests and failed the rejected-fetch recovery test because consent remained disabled.
  - Review correction GREEN passed the focused suite with 9 tests, including retry and all three eligible e-mail providers.
  - Post-correction UI and guard acceptance passed 8 suites and 61 tests.
  - All 16 locale JSON files parsed successfully.
  - Prettier check and scoped git diff check passed after formatting the new test.
  - Artifact validation passed with scripts/orchestration/validate_artifact.py.
changed_files:
  - apps/frontend/src/components/auth/register.tsx
  - tests/newsletter.consent.frontend.test.cjs
  - libraries/react-shared-libraries/src/translation/locales/ar/translation.json
  - libraries/react-shared-libraries/src/translation/locales/bn/translation.json
  - libraries/react-shared-libraries/src/translation/locales/de/translation.json
  - libraries/react-shared-libraries/src/translation/locales/en/translation.json
  - libraries/react-shared-libraries/src/translation/locales/es/translation.json
  - libraries/react-shared-libraries/src/translation/locales/fr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/he/translation.json
  - libraries/react-shared-libraries/src/translation/locales/it/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ja/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ko/translation.json
  - libraries/react-shared-libraries/src/translation/locales/pt/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - libraries/react-shared-libraries/src/translation/locales/tr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/vi/translation.json
  - libraries/react-shared-libraries/src/translation/locales/zh/translation.json
  - .codex/stages/content-factory-next-ry5.2/artifacts/frontend.md
explicit_defers:
  - none
---

# Summary

The registration form now owns an optional `subscribeToNewsletter` boolean with
an unchecked default. `RegisterAfter` derives eligibility from the registration
identity: LOCAL shows consent only while its e-mail contains `@`; GOOGLE,
GITHUB, and GENERIC rely on their backend provider contract; TELEGRAM and
FARCASTER never show the control. When eligibility is lost, React Hook Form
explicitly resets the value to `false`, so stale consent cannot survive a
conditional render. Every registration payload therefore carries an explicit
boolean.

Submission loading now has an explicit `try/catch/finally` lifecycle. Success
keeps the same pending, activation, and login redirects; HTTP errors keep their
field error; rejected requests set the existing general error and always leave
loading in `finally`. The checkbox and CTA therefore recover and allow a retry.

The control is a native `<input type="checkbox">`, not the shared custom
Checkbox. Its wrapping label gives the mobile interaction a 44px minimum target,
keeps focus visible with CF tokens, disables during submission, and allows long
copy to wrap at 390px. It is placed after `LegalNotice` and directly before the
primary account CTA. One `newsletter_consent` string was added to all 16 locale
files, including Arabic and Hebrew RTL copy.

## UI and data boundaries

- Route ownership is unchanged: the auth page renders `Register`, which resolves
  provider callback state and renders `RegisterAfter`.
- `RegisterAfter` and React Hook Form own the consent state and the explicit
  eligible/ineligible transition. There is no hidden component side effect or
  shared Checkbox dependency.
- The existing `useFetch` mutation sends the complete form to `/auth/register`.
  Backend DTO and provider validation remain outside this stream.
- Provider eligibility assumption agreed with the backend stream: GOOGLE,
  GITHUB, and GENERIC provide server-verified e-mail; TELEGRAM and FARCASTER use
  synthetic identities. LOCAL e-mail gets full validation at the DTO boundary;
  the UI `@` check only controls visibility.

## Reference comparison

The stable Lazyweb evidence set remains
https://www.lazyweb.com/agentic-search/fa8814a4-2de6-41ee-938f-2e291169f682.

- CarbonChain uses a separate explicit checkbox adjacent to its submit action.
  Content Factory adopts that placement while keeping consent optional,
  unchecked, native, and visually inside the existing auth shell.
- iManage collects only one address for newsletter use. Content Factory reuses
  the registration identity and adds no name, profile, or second e-mail field.
- The Pattern ends unsubscribe with a neutral one-action confirmation. This
  stream intentionally adds no application unsubscribe form or page: the
  infra-owned Listmonk UUID route provides that safe confirmation pattern
  without an address lookup.

# Verification

TDD was behavior-first. The production mutation that each test catches is a
missing eligibility branch, a stale `true`, a non-native/inaccessible control,
an incorrect payload boolean, a permanently disabled rejected request, or a
missing locale message.

The first two Jest attempts did not count as RED: the unprepared worktree lacked
dependencies and produced `spawn jest EACCES` / missing module errors. After the
approved frozen pnpm install, the exact focused target ran and failed 5/5 for the
expected missing behavior. Minimal implementation then passed 5/5.

The first design-guard acceptance exposed one new off-rhythm `1px` class while
all other checks passed. Root-cause inspection showed the optional optical
margin was the only added pixel debt; removing that single class made the same
acceptance set pass 8 suites and 57 tests. The final set covers the focused UI,
CF style guard, contrast, typography, foundation, locale key parity, translated
locale values, and UI literal policy.

Independent-review correction used a second focused RED/GREEN cycle. Before the
fix, the new rejected-fetch test passed eight sibling cases and failed because
the consent input stayed `disabled=true`; the CTA was disabled by the same
loading state. Moving the reset into `finally` made the suite pass 9/9 and
proved a second submission reaches `useFetch`. The eligible-provider case is
now table-driven for GOOGLE, GITHUB, and GENERIC, and each unchecked submission
sends the literal boolean `false`. Post-correction acceptance passed 8 suites
and 61 tests.

Accessibility evidence is DOM-driven: the test queries the checkbox by its
accessible name and confirms native checkbox semantics, an unchecked default,
the 44px label target, DOM order between legal notice and CTA, and the
stale-state transition. The implementation disables the control during submit
and keeps an explicit CF focus ring. RTL and 390px safety rely on logical flex
layout, `min-w-0`, `break-words`, `text-pretty`, and the Arabic/Hebrew locale
coverage; no local browser screenshot was required by this focused stream.

# Risks / Follow-ups

- Integration assumes the concurrent DTO accepts and validates
  `subscribeToNewsletter` as a boolean and that backend providers enforce real
  e-mail identities before subscribing. Root acceptance must verify that joined
  contract.
- Locale values are complete and non-placeholder, but native-speaker editorial
  review remains useful before a public release.
- This stream did not run a browser visual check, full suite, build, campaign,
  Listmonk instance, or unsubscribe route. Those are root/infra-owned acceptance
  boundaries, not frontend defers.
