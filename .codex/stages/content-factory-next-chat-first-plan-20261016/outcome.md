# Chat-first workspace planning — 16 October 2026

## Scope

Owner requested a design, implementation plan and one Beads epic for a chat-first product with a consistent manual workflow. This stage authors those planning deliverables only. No application implementation, live model replay, deployment or owner acceptance is claimed.

## Accepted inventory stream

- Child: `/root/chat_manual_inventory`, `gpt-6-luna` / `max`, read-only. Benefit: isolate the cross-surface reuse inventory while root writes the coupled design and plan. Documentation: current local source only; asset routing: existing components, no external assets or services.
- Delivery received and accepted by root: Agent remains secondary navigation; current empty right panel is onboarding progress; pieces/avatars/channels already have embedded real editors; selected artifact is local conversation state; private history uses `organizationId:userId`; existing piece writes use `expected`/409 and shared SWR revalidation. Root source inspection agreed with these findings.
- Suggested duplicate calendar embedding is not adopted as a requirement: retain the exact existing piece/variant/time editor and a contextual calendar entry/link. A common manual-page session facade and validated calendar scope are included instead.
- Child wrote no files and ran no tests/model/provider calls. No child worktree or temporary resources were created; safe-only cleanup: none needed. The stream is complete and accepted, not an application-quality acceptance.

## Evidence and limits

- Current source baseline `ade39a851`; planning branch `codex/chat-first-workspace-plan-20261016`.
- Owner screenshot was read from the Windows attachment through WSL; original contains account details and is not copied into Git.
- Previous turn's fresh piece/source/log read established the dated-change regression; private payload is not reproduced in public-safe design files.
- Graph reviewed using the current checkout's local map. Baseline `5cdd9002` is older than HEAD; useful locations were source-verified. No graph refresh in a documentation-only planning stage.
- Runtime/provider/owner behavior remains independently unverified in this planning stage. Earlier release acceptance is historical, not acceptance of the proposed redesign.

## Planning artifacts

- [Target specification](../../../docs/product/chat-first-workspace-spec.md)
- [Implementation plan](../../../docs/superpowers/plans/2026-10-16-chat-first-workspace.md)

Beads epic `content-factory-next-jvrq` holds eight open child packages (`.1`–`.8`), thirteen internal blocking dependencies and three related historical epics. Creation and sync-trigger responses are retained in `beads-mutations.actual.log`; network convergence is not inferred from an enqueue. This file records only planning acceptance and bounded child delivery; it is not an execution-status ledger.

## Root planning acceptance

- Fresh Beads readback: epic OPEN, exactly eight OPEN children under the expected parent; thirteen internal blocking edges, no cycle, `.1` first ready. The epic and all children now have actual private GitHub issue references; epic is issue1083. No historical task status was changed. Readback: `beads-readback.actual.json`.
- Target spec, bounded plan, synthetic prototype and both documentation indexes are linked. The existing current-state size limits were preserved by reflowing prose without dropping its evidence or changing configuration.
- Browser layout study:34 checks PASS in existing cached Chromium153, zero page errors. Four widths1440/1024/768/390 × two themes have no horizontal or document-height overflow. Artifact selection, manual/chat draft continuity, hide/restore, keyboard splitter, workspace search/Escape, unsent starters and mobile Chat/Material controls pass. Exact prototype SHA is recorded in `prototype-browser.actual.json`; five synthetic screenshots are retained here. Font fallback and local-only state remain explicit; this is not production accessibility or model acceptance.
- Documentation links PASS (199 files), `git diff --check` PASS, configured process-contract check PASS. The process checker still references the historical dbxe configured stage; its green result is not acceptance of the new application behavior. Logs: `docs.actual.log`, `process.actual.log`.
- Current diff under `apps/`, `libraries/`, `package.json` and `pnpm-lock.yaml` is empty. No full build/product suite was run for planning-only Markdown and a standalone design study. Release/full-suite requirements are retained in T8.
- Original clipboard image was not copied into the repo. Existing untracked stages/work, runtime, credentials, source remotes and original stored content are preserved. No browser/server/child resource remains running from this stage.
- Planning outcome is complete. Implementation remains future work in the epic, beginning with the selected baseline diagnostic. Current live model/provider/owner/deployment acceptance remains unverified and is not restamped from older evidence.
