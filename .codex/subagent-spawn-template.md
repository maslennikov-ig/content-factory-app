# Native Subagent Prompt

Use this four-field shape for a visible same-session Codex subagent. When the
stream touches external or versioned behavior, the Verification field carries
one compact `Documentation:` decision — the exact `docs-resolve` result. Omit
it for a local stream: an absent decision already means the spawned agent stops
before relying on external claims. Add a task reference, selected skill/docs, or
artifact path only when the stream needs it. The launcher explicitly passes
`fork_turns="none"`; task-specific overrides follow the shared delegation
reference instead of expanding this prompt.

```md
Goal: <one finished outcome>

Write zone: <owned files/directories; preserve unrelated and concurrent work>

Verification: <focused red/green command when assigned, otherwise: none during work; root final acceptance>

Stop: <scope expansion, ownership conflict, missing required context, or out-of-zone write>
```
