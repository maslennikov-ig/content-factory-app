# Voice, locale and native memory release — 26 October 2026

Task: `content-factory-next-dv8a`. Owner-authorized push/merge/deploy delivered
public/runtime `dc5893e2ad73`, tested private source `7f8bc4742df6e26964f2c3e1ccc2141da098d7b3`.
Registry: `ghcr.io/maslennikov-ig/content-factory-next@sha256:735fb73770c875651d341db25e07f2d05dd3d89eaa3f73d2e6acdb32cd2005a4`. Verified rollback: `34d3591b2cc1`.

## Result

Assistant actions use first-person singular; active progress covers 16 locales and
the main model receives the full trusted reply locale. Authored/channel/avatar
content language remains separate. Native preference memory runs without a
redundant ask while explicit policies still win; old memory cards have real
validated descriptions. No new queue/runtime, schema or provider configuration.

The actual cold observer GET preserves an old pending memory card without a
model call/write, then explicit approval executes once and a fresh memory call
autoallows. No extra policy guard was added after the native behavior was proven.

## Release acceptance

Nine configured release checks PASS. Types/all four application builds reuse
passing 0364884af evidence: the final delta contains only two test fixture files,
with exactly unchanged app/library/build/tool/dependency inputs. The canonical
full `pnpm test` receipt names the final private source above.

- Test Suites: 7 skipped, 779 passed, 779 of 786 total; Tests:       70 skipped, 13565 passed, 13635 total.
- Node: # pass 167; # fail 0. Python: OK.
- [Build CI](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40385804967): all four jobs green, including full/calendar/Docker proofs.
- [Code Quality](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40385804782): green. Private jobs did not start because the existing
  account billing/spending gate is active; no payment/access/workflow gate changed.
- Nginx, commands help, all eight SDK patch chunks, image digest/size and exact
  source archive/version checks PASS. Schema diff empty before and after: no SQL.
- Application healthy, three PM2 services online/zero restarts, worker ready.
  Preserved 46 threads/377 messages,
  native snapshots, usage rows, settings/config and foreign host workloads.
  Public login browser at 1440/390 sends no writes or paid requests.

Two cold UI import timeouts were corrected by loading the same real approval
components/registry before interaction timers. Assertions and timeouts were kept.
The memory-card 43-test suite passed with the calendar +400 days; all 27 video UI
checks passed with coverage/open-handle detection. Failed diagnostic attempts
remain private and produced no release receipt or production switch.
A separate local runner timeout came from ordinary `REDIS_URL` creating an
unmanaged module-global client after all assertions completed. Matching CI
by leaving only `CF_TEST_REDIS_URL` for native probes fixed it (four recovery
checks PASS in 10.29 seconds); no source or test assertion change was needed.

## Preservation, limits and closeout

Current/rollback retained through the canonical host retention helper. Owned
schema helpers, disposable DB/Redis/volumes/network, temporary credentials and
unused local release tags are cleaned. The review worktree is eligible only
after documentation delivery; final private cleanup receipts retain its outcome.
All branch refs, the original dirty checkout and foreign services are preserved.
Observed independent Helixa container replacements were recorded separately and
left intact. Minimal detailed evidence is retained outside Git under
`/home/me/.local/state/content-factory-next/release-voice-memory-20261026`.

A paused native run keeps its original frozen system instructions through its
completion; later new turns in the same chat use the new voice. Historical chat
text is not rewritten. Old card copy still has ru/en fallback outside navigation/
active progress. No new paid model/search/editorial run was performed.

Docs-reviewed: updated. Graph-reviewed: used — prior bounded stale owner lookup,
exact current controller/Memory/Session source checked; no shared graph refresh.
