---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-V
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: orchestration intermediate checks
public_facade: scripts/orchestration/verification_evidence.py CLI (run | fingerprint)
bounded_acceptance: reuse only on an honest content match; any doubt reruns
non_goals:
  - release gate (scripts/release/record-suite-receipt.sh untouched)
  - manifest and acceptance-receipt schemas from the archived branch
  - relaxing model_override_requires_current_user_authorization
evidence:
  - python-unittest-verification-evidence
  - process-verification-green
  - cli-smoke-reused-and-switch
task_id: content-factory-next-y5fb
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: content-addressed reuse must be forgery-resistant; the failure mode is silent false reuse
repo: content-factory-next
branch: worktree-agent-a403375fa88eb7965
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4257143f6b05351118fe8c4ba0e9ffb06
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a403375fa88eb7965
write_zone:
  - scripts/orchestration/**
  - tests/test_verification_evidence.py
  - AGENTS.md (one paragraph)
  - package.json (python test registration)
success_criteria:
  - receipt addressed by SHA-256 of inputs, command, cwd, tool versions, script digest
  - any changed input forces a fresh run
  - an edited or renamed receipt is refused rather than trusted
  - kill switch off by default and able only to force more work
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: worktree kept for root review; no servers or ports used
risk_level: medium
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - test-matrix
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: AGENTS.md Verification section gained one paragraph naming the mechanism and its limit
verification:
  - python3 -m unittest tests/test_verification_evidence.py: passed
  - python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py tests/test_verification_evidence.py: passed
  - bash scripts/orchestration/run_process_verification.sh: passed
  - pnpm exec jest tests/ci.full-suite.test.cjs tests/release.suite-receipt.test.cjs tests/supply-chain.supply-chain.test.cjs tests/repository-addresses.test.cjs: passed
  - python3 scripts/docs/check_docs.py: passed
changed_files:
  - scripts/orchestration/verification_evidence.py
  - scripts/orchestration/run_process_verification.sh
  - tests/test_verification_evidence.py
  - AGENTS.md
  - package.json
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
explicit_defers:
  - content-factory-next-y5fb: no orchestration step is wired to the runner yet; wiring is a separate call the root makes when it picks the first step
---

# Summary

An intermediate orchestration check can now be skipped only when the hash of what
it depends on is unchanged. `scripts/orchestration/verification_evidence.py`
computes one SHA-256 over the declared input files with their content digests,
the command, the working directory, the versions of declared tools such as node,
the declared environment variables' value digests, and the digest of the script
itself. The receipt (`verification-evidence/v2`) is stored under
`.codex/evidence/verification/<fingerprint>.json`.

Reuse is refused unless three things agree: the file name, the `fingerprint`
field inside, and the hash recomputed from the receipt's own recorded identity.
Editing the identity to claim other inputs breaks the third; copying a receipt
onto the wanted name breaks the second. Anything missing, malformed, or with a
non-zero recorded outcome reruns the check. No clock, branch, or commit name
enters the hash, so a receipt cannot be aged or named into validity.

The idea comes from the archived `archive/verification-evidence-late`
(`a1d6b1ea`, 727 lines); none of its code was carried over. Its manifest and
acceptance-receipt schemas were left behind as unneeded for intermediate steps,
and its change to `model_override_requires_current_user_authorization` was not
carried: the flag stays `true` and `run_process_verification.sh` still asserts it.

# Scope / Routing

Write zone as declared above. `scripts/orchestration/run_process_verification.sh`
gained the new module in its required-file list, and `package.json` gained the new
python set in the third half of `pnpm test`; without that registration the tests
would never run. No external documentation was needed: hashlib, glob, and
subprocess behaviour is stdlib and local.

# Verification

Listed in the front matter. The python set was red first (the module did not
exist), then green at 17 tests. End-to-end CLI smoke on a real command showed
`verified` -> `reused` -> `verified` again under
`ORCHESTRATION_EVIDENCE_REUSE_DISABLED=1`.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing was pushed.

# Risks / Follow-ups / Explicit Defers

- Receipts land in `.codex/evidence/verification/` and are untracked. A
  `.gitignore` entry belongs there, but `.gitignore` is outside this write zone,
  so the root decides whether to ignore or track them. Untracked receipts show up
  in `git status --short`; they do not fail any check today.
- A receipt is only as honest as its declared input list: a step that forgets an
  input can reuse when it should not. That is why `inputs` may not be empty and a
  glob matching nothing is an error, but the completeness of the list stays the
  caller's judgement.
- No orchestration step is wired to the runner yet; the mechanism exists and is
  documented, and the first wiring is a root decision about which step is worth it.
