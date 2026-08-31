# Subagent Task Contract

Native same-session subagents receive four fields from
`.codex/subagent-spawn-template.md`: goal, write zone, verification, and stop.
Prompts stay outcome-first. The Documentation decision belongs in the prompt
only when the stream touches external or versioned behavior; selected
task/skills/artifacts are optional pointers, not mandatory empty sections.

- A worker owns one bounded stream, preserves unrelated/concurrent work, and
  stops on a write-zone conflict or scope expansion.
- Worker verification is only the focused red/green target that accompanies
  its change, or an explicitly assigned final-verification stream. Otherwise
  write `none during work; root final acceptance`.
- Reviewers inspect the diff and existing evidence. They report a concrete
  evidence gap instead of rerunning acceptance.
- Completion signals return work to the root; they do not accept it.
- Portable, background, cross-runtime, and manual-handoff prompts use
  `prompt-authoring` and its larger contract instead.
