# Legacy scenario fixture contract repair

The first root full-suite attempt failed the legacy scenario suite before its
first model/tool invocation. A single-child diagnostic captured the original
exception: `TypeError: runAsActingUser is not a function`, raised by the current
`AiUsageService.prepareModelExecution()` wrapper. The scenario runner replaced
the acting-user module with a fixture exporting only `getActingUserId()`.

The fix adds the missing `runAsActingUser(_userId, work) => work()` export to
that same single-user fixture. Its existing fixed `USER.id` actor is unchanged.
This is one added line in `tests/helpers/agent-scenarios.runner.cjs`; application
source and all scenario/suite assertions are unchanged. A scoped search found
no other acting-user stub in `tests/helpers/agent-scenarios*`.

## Focused verification

Node 22.23.2 ran the real scenario runner for:

- `adaptation-ai-traces-by-channel` (read + paid review),
- `piece-delete-approved` (stored approval and exactly one deletion),
- `piece-create-questions-first` (person-only answer boundary),
- `ai-key-pasted` (secret redaction),
- `avatar-manual` (consent suspension/resume).

All five scenarios, eleven requests, passed their unchanged original
`scenario.check()` assertions. The focused check also verified clean SSE/client
state, one closed actor-attributed `agent` admission per request, capability
coverage and the original secret/literal guards. `git diff --check` passed.

Evidence:

- `evidence/legacy-scenarios-first-error.log` retains the original exception.
- `evidence/legacy-scenarios-focused-green.log` records the focused results.
- `evidence/legacy-scenarios-source-sha256.txt` binds source/fixture inputs.

The first root `pnpm test` failure remains a failed receipt. This focused check
does not replace root's required complete rerun of all three test phases. No
build rerun is required by this test-fixture-only change.
