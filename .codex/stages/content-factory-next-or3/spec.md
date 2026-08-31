# Stage 6: public product funnel

## Outcome

Show the real product before registration, let an anonymous visitor complete a
fully synthetic walkthrough, preserve their allowlisted starter-template intent
through LOCAL and OAuth registration, and measure only six first-party daily
conversion aggregates without identifying a visitor.

## Product contract

- Public `/`, `/product`, `/security`, `/docs`, and `/demo` describe only
  shipped behavior, preserve the AGPL Source offer, and make no pricing, trial,
  card, self-hosting, provider, region, legal-model, SLA, or certification claim.
- The demo is versioned client-side synthetic state for
  `plan → draft → review → schedule`. It never reads tenant data and never calls
  PostgreSQL, AI, Temporal, OAuth, publishing, paid, or mutating endpoints.
- Signup step one accepts only email into ephemeral client state, writes no
  account or organization row, and never places email in the URL.
- Signup step two completes LOCAL or OAuth registration with required Terms,
  optional newsletter, optional workspace name, and backward-compatible
  `company` and `starterTemplate` inputs.
- A public template choice is an allowlisted intent. It is applied exactly once
  to the newly created workspace through a server-owned idempotent contract;
  blank remains the safe no-op.
- The first real template is `content-workflow`: it atomically seeds the new
  organization with four existing tenant tags — Plan, Draft, Review, and
  Schedule — matching the synthetic demo. It adds no schema table or migration.
- OAuth continuity uses one allowlisted, expiring, single-use browser-session
  intent containing no email, workspace name, provider token, or payload. It
  never enters the URL and malformed/stale state falls back safely to `blank`.
- Conversion telemetry accepts exactly `landing_view`, `demo_started`,
  `demo_completed`, `signup_started`, `registration_completed`, and
  `workspace_activated`. It stores no persistent visitor id, IP, referrer,
  user-agent, email, URL, or arbitrary properties.
- A super-admin-only aggregate report reads `PublicGrowthDaily` and returns
  only six bounded totals plus five zero-safe ratios. It never joins or exposes
  trusted receipts, users, organizations, dimensions, or raw request metadata.
- Every new string is complete in all sixteen locale bundles; RU and EN are
  inspected at 390 and 1440 in both themes.

## Design direction

Extend the existing Desert Lab public system. The visitor should first see a
calm, truthful product trace; the synthetic walkthrough then becomes the main
evidence, and registration is a short continuation rather than a gate. Reuse
the established header, typography, controls, tokens, locale system, and
development-only interface-review seam. Lazyweb evidence supports an email-only
first step, explicit required labels, and a separate optional newsletter choice;
it does not authorize additional fields or commercial claims.

## Technical premortem

Verdict: **GO WITH CONDITIONS**. The change is additive and locally reversible.

| Failure symptom | Evidence / mechanism | Required prevention and proof |
|---|---|---|
| Step one silently creates an account | Existing registration code is stateful and easy to call too early | Step-one component has no registration request; database proof shows unchanged user/organization counts |
| Template picker is decorative or seeds twice | Legacy `starterTemplate` reaches registration but blank is currently a no-op | Closed catalog, server transaction/idempotency, LOCAL and OAuth end-to-end proofs, replay proof |
| Anonymous demo exposes or mutates real data | Public code can accidentally reuse authenticated fetch helpers | Browser HAR/request ledger plus offline pass; synthetic version is the only data source |
| Telemetry becomes tracking | Free-form payloads or middleware metadata can retain PII | Closed event/type/payload contracts, metadata minimization, rate limit, seventh-event and arbitrary-property mutation tests |
| Public copy overpromises deferred decisions | Existing pages have a claim ledger but new strings can bypass it | Extend the exact claim guard; no pricing/trial/card/self-hosting/provider/region/legal promises |
| OAuth loses the intent or Terms state | Redirect boundaries can drop ephemeral client state | Signed/short-lived server-owned continuation or existing supported registration state; no email or intent in URL; expiry and replay proof |
| Executor rebuilds accepted surfaces | Most routes and components already exist | Gap maps name what is retained; implementation changes only missing observable contracts |

## Recovery

Rollback removes the additive public-funnel continuation, template seed, and
aggregate endpoints/components. Existing users, organizations, content, public
legal routes, and the accepted image-editor line remain unchanged. No live data
or production action is part of this stage.

## Non-goals

- No stage 7 repository move, push, remote branch, PR, merge, deploy, production
  mutation, credentials, paid call, live fetch/publish, or real-user message.
- No pricing, trial, card, self-hosting, provider, data-region, legal-model, SLA,
  or certification decision.
- No persistent visitor profile, attribution identity, session replay, or
  arbitrary analytics properties.

## Documentation and evidence decisions

- Graphify query used for `PublicHome`, `SyntheticDemo`, `StarterTemplate`,
  registration, and existing public telemetry before broad inspection.
- External/versioned dependency behavior is not the product contract. The
  implementation follows repository-owned Next, auth, Prisma, locale, and
  browser-evidence seams; one local Next documentation resolution was run for
  App Router client navigation and query-parameter behavior.
- Lazyweb evidence is finalized privately at
  `https://www.lazyweb.com/agentic-search/0c060989-5b0f-4acd-ab6f-4ab09e951a68`.
