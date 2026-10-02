# LinkedIn PDF test timestamp repair

Goal: repair only the new PDF comparison test. Root's exact d67 full run observed a one-second CreationDate difference in PDFKit's indirect object; the inline-only canonicalizer missed it. Production code and the original PDF/Bluesky freezes remain unchanged.

Write zone: `tests/backend-memory.linkedin-pdf-lazy.test.cjs` and this new evidence stage only. Isolated worktree `/home/me/code/content-factory-next-worktrees/0qgn-linkedin-pdf-test-time-20261002`, branch `codex/linkedin-pdf-test-time-20261002`, base `d67c88819e852d29581cc3a4c7b11e0f3187b61b`. Other workers/root own source, CI, live observation and release. No integration before root's current full run completes.

Documentation: current AGENTS, root failure log lines 146–176, installed PDFKit 0.15.2 serialization at pdfkit.js:141,5491,5506,5646 and its timestamp-derived file ID. Received review was verified against the actual log and package source. Asset Routing: existing sharp/PDFKit synthetic in-memory images, installed dependencies reused by an owned symlink; no installation/assets/network.

Given two valid installed-PDFKit outputs with explicit creation dates one second apart, When compared, Then only the actual referenced CreationDate value and trailer file IDs normalize. Explicit dates require no current clock, timer or global Date mutation. Given another image, page size or ModDate, Then comparison still rejects the difference. Preserve other object IDs, contents, streams, images, page dimensions, whitespace, xref/trailer and EOF bytes.

Verification: deterministic RED against the original canonicalizer; focused normal Jest run and focused 400-day run using the existing time-travel setup through pnpm; no full suite or type rerun because production is unchanged. Check tracked ownership, Git/blob hashes, installed sources and both prior freezes. Freeze one test-only commit plus matching evidence for root review. Root retains full release/RAM acceptance.

Stop: out-of-zone writes, production/installed dependency or clock/timer mutation, requirement to loosen comparison beyond the actual creation metadata, or any live action. No nested agent or provider call.
