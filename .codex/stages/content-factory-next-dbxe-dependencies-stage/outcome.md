# dbxe.8 dependency stage outcome — 9 October 2026

Local dependency remediation implemented on `codex/audit-readiness-20261009`.
Beads dbxe.8 stays IN_PROGRESS because its original next-release acceptance
criterion is not satisfied by local checks. The epic and unselected tasks remain
unchanged. Owner selection is required before another stage; no continuous goal.

## Remediation and applicability

- Examined all12 critical /131 high baseline production range records first.
  Minimum scoped patches eliminate120:10 critical and110 high.42 package names
  were deliberately patched, plus their necessary native/platform/peer children.
- Fresh exact-lock production graph:2330 snapshots, zero unresolved;
 2 critical /21 high remain. Full shipped graph:2892 snapshots, zero unresolved;
 5 critical /21 high remain. The additional3 critical are dormant Vitest UI and
  Tinypool test-worker surfaces, discovered by explicitly including shipped dev.
- Reconstructed the original full shipped graph too:16 critical /143 high;
 133 of159 initial records eliminated. One additionally discovered intermediate
  shell-quote1.9.0 critical was corrected to minimum1.11.0 rather than accepted
  as a nominal patch.160 decision records preserve official sources and ranges.
- Retained Happy DOM/tar are build/test/native-install consumers, not app HTML
  evaluation/archive ingestion. Other exceptions cover uncalled Nest TCP/RMQ,
  TipTap Markdown helpers, LangSmith public prompt pull, FTP/PAC generator code,
  fixed native-tool commands, trusted glob inputs and MIME-forced MP3 parsing.
  Each decision names the exact locked version/caller and reevaluation trigger.
  These ranges remain visible; no claim that all vulnerabilities are removed.
- Windows-only Next RCE is inapplicable to Bookworm/Linux. No next/og
  ImageResponse, custom server or remotePatterns caller. Next16.3.8 still removes
  those ranges and the conservatively patched AVIF/libheif optimizer surface;
  actual app Sharp0.35.5 native processing is exercised.

Exact evidence: `applicability.json`; operator guide:
`docs/operations/dependency-security-remediation.md`. Official metadata,
bounded audit responses and raw diagnostics remain local. No pnpm audit heap
increase, blind latest/force fix, framework rewrite or source-search refactor.

## Compatibility and acceptance

- Frozen install PASS with Node22.23.2/pnpm10.6.1.2943 installed package copies
  match their hoisted-lock metadata, normalizing one vendor leading-v version.
  React19.2.4, Prisma6.5.0, Nest11 and Temporal1.15 lines remain unchanged.
- 39 affected Jest suites /607 tests and47 Node source/gateway tests PASS,
  zero skips.14 new actual-library checks include entropy, safe multipart header
  serialization, Handlebars AST validation, proxy subnet trust, both shell-quote
  gadgets, native PNG/JPEG/AVIF, SMTP message/envelope, multipart buffer/nested
  fields/size errors, gzip, real Temporal protobuf and loopback gRPC, XML4/5.
  Existing MCP end-to-end uses actual SDK against inert in-process product doors.
  Earlier red proof and corrected fixture assumptions remain separate diagnostics.
- Four production apps build: frontend/backend/orchestrator/commands. Actual
  Vite6.4.3 extension compilation PASS. Its shell packaging command fails because
  system zip is absent, after successful compilation; this failure is retained.
  A real four-file Python ZIP passes CRC and exact manifest/bundle equality.
  There is no false shell-command PASS or actual browser-extension acceptance.
- Built Next loopback login200 /non-allowlisted image400; exact owned process
  stopped. This is compiled route/optimizer smoke, not production/UI acceptance.
- Root proof: `acceptance.json`; canonical closeout receipt includes exact proof
  reuse, docs/diff/process checks. No second product test/build acceptance loop.
  Current handoff/summary/inbox paths corrected without changing guard policy.
  Historical untracked raw outputs are preserved; their broad debt-scan matches
  are a recorded tooling limitation in Beads8, not new product debt.

## Remaining boundary

No production deployment/mutation, source push, paid/provider calls, real email,
social connection/publication, credential rotation or schema change. No Temporal
workflow/activity contract change. Current server fixes are not inferred.

Original dbxe.8 next full release acceptance remains mandatory: exact-SHA full
suite receipt, configured release checks, copied public-tree/image/native runtime
proof and authorized delivery.12 low /68 moderate production records remain
visible and are not an all-advisories acceptance claim. Existing SaaS/client/
legal/research/collector/invoice/backup gates and all unrelated task criteria stay.

Follow-up root review of delivery `48330283b` accepted the local boundary;
no package/application correction required. Independently checked matching
source/log receipts, all2943 installed copies and every ZIP entry; all30 original
acceptance criteria remain intact. See `review/review.md`.

Candidate next bounded stage: dbxe.6 publish receipt/reconciliation, prompt in
`next-stage-prompt.md`; alternatively an explicitly selected release. Stop here.
