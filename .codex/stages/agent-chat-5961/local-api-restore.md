# Local production API configuration restored — 25 October 2026

Task: `content-factory-next-o260`. The owner explicitly requested removal of
the local model and reuse of production's existing API/model selection.
The application fixes, databases, chats and foreign services remain preserved.

## Current runtime

- Frontend: <http://localhost:4316/agents>; backend: loopback3516.
- Preserved owner chat: <http://localhost:4316/agents/7fadfb0c-a35b-4658-9058-4b7de814a27a>.
- Provider: OpenRouter, included/system-key mode.
- Primary: `openai/gpt-6-luna`; advanced and fallback: `openai/gpt-6.1-sol`;
  production Flex and native routing enabled. Image: `openai/gpt-5-image-mini`.
- Research: Exa; facts and discovery: Tavily. No public-feed replacement.
- `scripts/development/agent-chat-api-preview.cjs` starts ordinary Nest modules
  with the existing local session/storage identity. No model, protocol, timeout,
  tool-list or search-provider override remains. Model IDs come from settings.
- Private runtime control: `/home/me/.local/state/content-factory-next/local-real-model-20261025/manage-stand.py`.
  `restart-backend` and `restart-frontend` validate the exact process identity.
  `start` starts backend/frontend only when their ports are free. The historical
  directory and database names are retained to preserve the existing sessions.

Production instance/workspace settings and environment were read through SSH
and the deployed Prisma/configuration resolver. Only the existing operator AI
and search configuration was applied locally, with local encryption and private
mode600 storage. Local database, session, Redis, upload and publication isolation
remain. No production data/configuration was changed. No video/social credentials
were added. No credentials were written to Git or diagnostic output.

## Removed

- Exact owned Windows directory `C:\Users\masle\AppData\Local\content-factory-local-llm-20261025`:
  Qwen GGUF, llama.cpp binaries, download archive and logs; 60 files,
  9,143,300,816 bytes. Its process55704 was verified against path, command and
  creation-time receipt before termination; no listener remains on8335.
- Exact owned gateway process53852 and port8336; model/profile/gateway/public
  research scripts and their two obsolete tests removed from the worktree.
- 533 owned transport/source trace files and obsolete private model helpers:
  34,844,710 bytes. Total model-runtime cleanup: 9,178,145,526 bytes (9.18GB).
  This is file removal, not a claim of WSL virtual-disk compaction.

Small historical engineering evidence remains. Historical Qwen answers and
native execution checkpoints are saved chat data and have not been rewritten.
The two old suspended child snapshots belong to canceled diagnostic parent
runs whose task states are settled/interrupted; they are not active model work.

## Verification

- Exact resolved provider, key, base URL, text/image models, roles, native
  routing, search settings/keys and fallback chain match the live production
  resolver output captured at2026-10-25T14:12:13Z. Secret equality was checked
  privately. The running local `/settings/ai` exposes the expected configuration.
- Ordinary backend startup succeeded; browser reload displays retained chat
  history and the composer. The final read has no new browser errors. A temporary
  browser write-block used during inspection was removed before handoff.
- Three focused suites, 80 tests PASS: `ai.clients`, `ai-provider.usage-mode`,
  `ai-model-routing.native`. Launcher syntax and `git diff --check` PASS.
- All19 local threads,54 messages, native metadata, pieces, derivations and
  posts match the before-state. The original4296 chat is unchanged. Usage ledger
  is unchanged; no new inference was invoked during startup or verification.
- Original checkout HEAD and11 dirty-file hashes match. Nine protected
  application process identities match, including the original4296/3496 preview.
- Model directory absent and both8335/8336 listeners closed. Current launcher
  has no references to the removed adapters.

Private receipts: `.../local-real-model-20261025/api-restore/`:
`local-settings-parity.json`, `http-settings.json`, `provider-tests.log`,
`preservation-records.json`, `preservation-final.json`, `cleanup-summary.json`.

No paid generation/search acceptance run, push, deployment or production mutation
was performed. A new real user request uses the configured API and its normal
billing; historical local-Qwen quality observations do not prove this API's
end-to-end editorial behavior. Existing question/Stop/recovery fixes are retained,
but paid-model question/answer/recovery acceptance was not repeated here.

Docs-reviewed: current handoff/index and historical runtime notes updated.
Graph-reviewed: owner graph used read-only as stale orientation; current provider
resolution and native recovery code inspected directly. No refresh/model calls.
GitHub sync skipped locally; the managed Linear/Beads publisher remains authority.
