# HONEY-5961 release regressions — 24 October 2026

The owner subsequently authorized push, merge and deployment. Release work is
isolated in `codex/release-agent-chat-5961-20261024`; the original dirty checkout
and the accepted local preview remain intact.

The first full release-suite diagnostic found three product regressions and
two Docker transport failures. It was stopped after the failures were captured;
it produced no passing suite receipt and authorizes no image publication.

- A failed approval answer could clear uncertainty using a pending projection
  without identifying its current running native owner. Recovery now requires
  a matching native run or terminal execution, restores the SDK's optimistic
  approval part to requested, and never resends the answer. A pending projection
  for a different run cannot take the observer-reconnect shortcut. Focused
  cases cover absent, mismatched and matching run IDs, terminal reconciliation,
  explicit retry and the existing Stop guards. An expired seven-day execution
  receipt can report `unknown` while the authoritative pending native gate
  remains valid: its matching run ID still permits an explicit answer. A
  focused red/green regression covers that durable-wait case too.
- Keeping an in-flight domain questionnaire visible also accidentally kept
  older selection questions expanded. That retention now applies specifically
  to domain questionnaires; existing selection questions fold into their
  answered line when continuation begins.
- Source revisions increased the 100-source research preview beyond its
  existing 95,000-character guard. Statement previews are bounded to 150
  characters, retaining every row, source revision and authorized read route.
  Complete stored statements, quotes and source bodies are unchanged. The
  existing source-99 tail and changed-revision refusal checks pass.
- Docker Desktop was available through its WSL proxy, but the private release
  CLI adapter initially conflicted with explicit default-context selection and
  exposed WSL-local bind paths the daemon could not read. The adapter now
  normalizes only the measured local default context and shares temporary test
  files through its task-owned WSL directory. No repository Docker policy,
  service configuration, test assertion or cleanup ownership guard was weakened.

Matching focused evidence: five suites / 105 tests passed, zero skipped. The
final conversation rerun covers 69 tests; the model and two Docker suites reuse
their unchanged matching passing inputs. The exact tested release commit still
requires the full canonical `record-suite-receipt.sh` gate before publication.
Private logs live under the operator's release-state directory; no credentials,
production messages or private incident text are included here.
