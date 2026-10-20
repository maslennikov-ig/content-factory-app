## Goal
Implement this complete cohesive task of the existing native Mastra epic. Gemini Argon is executor; local implementation only, no deploy.

### Task4 — Native autonomy, planning, questions and delegation (`on0i.4`)

**Boundary:** exposed agent capabilities and model decisions; distinct from
transport and persistent ownership. **Dependencies:** Tasks1,2,3,5.
**Files:** `conductor.agent.ts`, `conductor.skills.ts`, `conductor.instructions.ts`,
capability registry/admission/adapter, controller config and small role-specific
native-agent definitions only where there is a useful consumer.

Use native ask_user, submit_plan, task tools, typed queueSignal,
state/notification signals and beforeApproval preflight validation, plus
optional tool discovery. Register task tracking exactly once. Model chooses
whether to plan, ask, delegate or answer. Native goals use a metered judge and
read-only artifact/source verification, not a deterministic topic workflow.
Expose bounded research/writing/review delegation through one native surface,
with least-privilege inherited context and configured role models. Support
explicit agent follow-up schedule creation/read/cancel through native schedules
without another cron engine; no proactive task created merely by opening a chat.
**Acceptance:** self-contained requests do not need an artificial intake/plan;
ambiguous business facts trigger a useful question; delegated “decide for me” is
honored; multi-step goal cannot mark complete from self-written prose alone;
queued/steering input and background result refer to the right task. Cross-role
subagents cannot gain write/publication rights or leak other histories.
**Focused checks:** native installed tool/goal/delegation behavior in actual
product composition, varied frozen input fixtures, approval denial/resume,
long-chat task recovery, local schedule/timezone/cancel and task-state recall.

A1-A31 and the full consumer/recovery/compatibility contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Automatic retry/fallback and menu scope: .codex/stages/content-factory-next-on0i-native-harness-20261019/retry-fallback/reliability.md. Keep the same epic/task identities and dependency graph.
