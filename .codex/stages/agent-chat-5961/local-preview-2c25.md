# Local preview 2c25a3d13bb7 — 25 October 2026

The retained local preview now runs public release `2c25a3d13bb7`, corresponding
to private application source `48e6c53fcde02695b3aa869116f33d5b937c245a`.
The runtime uses the existing owned release worktree. Its initial HEAD
`565b91ac875884059080a113752e2a288c84f044` differs from that source only in
release documentation; application inputs match. Installed Mastra core 1.78.0
and all eight patched CJS/ESM chunks match the released image exactly.

Open <http://localhost:4296/agents/585bac96-71db-4884-8233-b6c22467d2c7>
in a private browser window. The saved Telegram draft opens beside the chat.
The old `a5222c3c-2cc7-4c30-aec1-fef81687b8a9` example remains readable.
Backend: <http://localhost:3496>; `/public/source/version` reports the exact
public source. The matching source archive is retained locally and served.

## Fresh acceptance

- Actual Next/Nest/auth/domain/native PostgreSQL/Redis with backend heap 512.
  External inference/search are frozen and backend non-loopback HTTP/fetch is
  denied. No production, paid-provider or real-account action occurred.
- Main request: custom answer survives reload; saved answer and question 2 survive
  actual SIGKILL of our backend and a new process. A final core answer receives
  HTTP 200, whose response is deliberately lost. History restores `piece_adapt`
  without resending the answer. Choice/delegation continue automatically to one
  piece and one Telegram draft, terminal `settled/completed`, pending 0.
- Saved-question case: full long question and all seven options match exactly;
  option 7 with keyboard, custom text, choices 1+7 together and explicit delegation
  complete four questions. Database readback proves one applied batch and correct
  person/model origins. Its thread is `f6c66a02-b455-45c1-b0bb-2e32c846c9c4`.
- Stop case `2a9b5cd9-74d0-40a6-8344-0f2ffa811611`: accepted partial answer and
  unsent draft survive reload; Stop preserves unsent text, removes the card and
  settles interrupted/pending 0. All four domain questions remain unapplied.
- Question 390px and completed desktop 1440px pass; no horizontal overflow, page/API
  errors or external requests. The saved draft restores after later navigation.
  Screenshots are under ignored `output/playwright/local-2c25-*.png`.
- Four focused native suites: seven selected tests PASS, 78.51s. They cover the
  delayed approval/admission race, slow availability handoff, both cold queued
  Stop witnesses, cold permissions and HTTP approval/question replay. Sixteen
  cases outside the explicit name filter were not selected; no selected test was
  skipped for missing environment. Exact command is in the linked proof.
- Previous 8 pieces/5 derivations/5 posts/channel/AI setting remain byte-exact by
  row hash. New records are exactly three owned pieces, one derivation and one
  DRAFT post; no release or publication journal. Two retained source links and
  the custom answer remain present. The original main checkout HEAD/status and
  all 11 dirty-file hashes are unchanged.
- All 24 previous listening addresses remain listening. Seven foreign listener
  PIDs are identical; external 3488/3489 were replaced by identical command/cwd
  processes during the check. This task signaled only its verified own backend.
  No foreign service was stopped, restarted or reconfigured by this task.

[Sanitized proof](local-preview-2c25-proof.json). Private configuration, raw
history, logs, process identities and storage hashes remain outside Git in
`~/.local/state/content-factory-next/local-preview-2c25a3d13bb7-20261025/`.
Existing synthetic databases were reused without recreation or schema changes.
The original private stand file is preserved; runtime uses an owned copy with
updated source/archive settings.
The temporary owned browser is closed; frontend 4296/backend 3496 remain running.

## Restart and boundaries

The private local operator helper owns exact PID/cwd/command/start-time checks:

```bash
# Start after the stand has stopped; refuses an occupied port.
python3 ~/.local/state/content-factory-next/local-preview-2c25a3d13bb7-20261025/manage-stand.py start
```

It uses Node 22.23.2, the existing dependencies and the updated private stand.
Do not use the historical feature-worktree restart instructions for this preview.
Real provider/editorial quality and arbitrary assistant requests are outside this
scripted acceptance. Matching full release/CI results remain valid for unchanged
application inputs; no full rebuild or suite was repeated for this local update.
No push or deployment was performed.

Docs-reviewed: current preview/restart/proof pointers updated; historical release
and feature receipts retained. Graph-reviewed: reused the accepted release's
source/SDK ownership evidence; no application/architecture change or graph
refresh/external extraction was needed.
