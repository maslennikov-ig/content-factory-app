# One grounded reader summary

Goal: content-factory-next-ec48.7. Parent epic: content-factory-next-0qgn.
Sequence 3 follows locally accepted auth slices; their original deployment
acceptance remains pending. Original task description is anchored verbatim.

Root owns task truth, decisions, durable contract, coordination, final checks
and delivery. Visible search_summary worker (gpt-6.1-sol/max) owns only
web.research.service.ts, web.research.summary-language.test.cjs and, if required,
existing web.research.service.test.cjs fixture expectations. Shared checkout,
no overlapping writer. Interacting summary/failure/metering logic benefits from
context isolation while root prepares the delivery/capacity boundary.

Contract: docs/product/search-summary-contract.md. Root diagnostic confirmed
provider answers joined before a translation-only gate. Multiple answers require
one bounded source-grounded synthesis/translation, with single/caller-query
fastpaths and a first-answer fallback. No paid/model/search/production call.

Local Graphify orientation:
`python3 /home/me/.agents/skills/graphify-project/scripts/graph_context.py --repo /home/me/code/content-factory-next --symbol WebResearchService --relation all --direction both --limit 8`.
Read-only graph baseline c1e44cfd differs from HEAD9275ea472; result truncated
at 8/27 neighbors. Controller, copilot and agent are consumers; exact current
service/test source confirmed. No complete impact or current graph claim.

Worker delivered stable source/test hashes after focused RED/GREEN (25 tests).
Root completed six core search suites: 134 tests passed, zero skips; backend
types passed. Independent review found no implementation blocker and one P3
doc mismatch about supported languages; root qualified ru/en and documented
the first-answer-language fallback. No code changed after the passing checks.
Delivery/acceptance/cleanup is in artifacts/search-summary.md. Live semantic/source
faithfulness and application deployment remain separate acceptance.

docs-reviewed: updated — durable summary contract and project navigation reflect
merge/translation, source grounding, language/one-call bounds and failure fastpaths.
graph-reviewed: used — focused stale graph orientation plus exact current source;
no refresh before accepted relevant integration/release.
