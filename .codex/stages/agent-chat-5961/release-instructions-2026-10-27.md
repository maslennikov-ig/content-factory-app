# Current instructions in existing chats — 27 October 2026

Task `content-factory-next-hbe3`: public/runtime `1fd383418d7a`, private app source
`b458f7883bf18115b65dc23500337f9d79a8960a`. Registry `ghcr.io/maslennikov-ig/content-factory-next@sha256:2d50a9fdb7d88bb45e52e465df4843f07f1d79c58519d30b516ab64b7f5c124f`. Rollback `dc5893e2ad73`.

The existing bundled-instructions processInputStep shares the Agent instruction
resolver, replacing the outgoing untagged prompt even for old native runs.
ConductorMemory's public processor provider resolves getSystemMessage on input
and per-step phases in its owned memory tag, replacing the old generic guidance.
No snapshot/history rewrite, new store/queue, SDK patch or paid call.

Nine local checks/all four builds/three typechecks PASS. Test Suites: 16 skipped, 771 passed, 771 of 787 total;
Tests:       151 skipped, 13485 passed, 13636 total. Node # pass 167 / # fail 0; Python OK.
[Build CI](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40469996402) and [Code Quality](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40469995171) green,
including full/calendar/Docker proofs; all three suite halves verified.

Four focused suites/122 tests and the final PG/Redis cold Session migration PASS:
old instructions, process death, passive reconnect without inference/writes,
explicit approval, current actual model prompt, unchanged historical user rows
and exactly-once tool execution. Warm/serialized processor checks preserve tagged
guidance/history/full locale, avoid duplication and read the workspace once.
All model streams are controlled free fixtures.

Image nginx/CLI/eight SDK hashes/digest/size/source archive PASS. Empty schema diff
before/after, no SQL. App healthy, PM2 online/zero restarts, worker ready. Preserved
46 threads/377 messages,
8 suspended snapshots, usage/settings and
foreign host workloads. Public login browser PASS at 1440/390; zero mutations.

Reload the same chat. Its next model step, including continuation after an explicit
pending answer, uses current instructions. Existing approvals still need the
person's answer. History stays verbatim; diagnostics never answer production gates.
No paid real-model/editorial acceptance. Legacy cards outside active progress/
navigation retain ru/en fallback. Private Actions remain billing blocked; free
public CI is green.

Canonical retention keeps current/rollback. Owned schema helpers, test containers,
volumes/network/credentials and local tags are cleaned. Worktree removal follows
docs delivery with branch refs retained; final private receipts stay under `/home/me/.local/state/content-factory-next/native-instructions-20261027`.
Foreign changes/services/shared caches are preserved. Docs-reviewed: updated.
Graph-reviewed: stale owner graph used for orientation, exact source/SDK verified.
