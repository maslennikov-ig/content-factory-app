# One automatic core repair and intact adaptation text

**Goal:** implement Beads `content-factory-next-0qgn.18` and `.19` as one bounded
source stage: ready drafts with low cognitive load and no hidden stylistic
deletion by code. Owner approved this behavior on 08Oct2026.

**Approach:** inspect the initial core with existing local anti-copy and
meta-speech checks, combine their hints, and invoke at most one repair. Keep
the first answer and its delegated decisions if repair is empty, fails, or
increases source copying. Recheck remaining findings locally and log them
honestly; no extra model critic, forced questions, or new approval list.
Preserve the selected model text apart from existing technical citation-label
handling. Adaptation persistence stops calling the stylistic deletion helper.

**Non-goals:** change style-analysis sample coverage/default (`.17`), profile
field-filter contracts, search, Temporal contracts, publishing, schema, UI,
paid model QA or production deployment. The working service remains on its
previous release until a separately selected delivery stage.

## Scope and acceptance

- `.18`: clean core takes one model invocation; simultaneous copy/meta
  findings take at most two total. Rejected repair retains the original text
  and decisions. Accepted repair keeps its own decisions. Original author
  facts, anti-copy requirement and fallback remain in the existing contract.
- `.19`: no audience sentence/prefix disappears via deterministic editing
  from a generated core or adaptation. Adaptation body, post and event see
  the same preserved meaningful content. Technical citation labels still do
  not enter the editor. Human-authored edits remain intact.
- Normal drafts gain no mandatory user decisions or new quality gates.
- `.17` remains pending; all voice/sample/prompt modules stay unchanged.

## One cohesive implementation boundary

**Owner:** root. **Files:**
`libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts`,
`pieces/piece.service.ts`, exact affected tests and product documentation.
Public request/response/storage shapes are unchanged. The historic deletion
utility remains importable for existing receipts/tests; active write paths
stop using it. No helper framework or new prompt-version ladder is needed.

1. Update existing behavior tests and reproduce the unwanted call count and
   content deletion without DB/network/model access.
2. Implement combined repair and remove active stylistic deletion callers.
3. Run the affected core-writing, adaptation-persistence and historical guard
   suites once as the final acceptance set; backend TypeScript and diff check.
4. Inspect the scoped diff, update Beads/handoff/index, save a local commit.

Proof uses the actual writer/service with substituted provider/repository
ports. It establishes source behavior, not provider prose quality, production
latency, invoices or live delivery. Root reviews the change; no extra agents.
Rollback is a scoped source revert; stored drafts/profiles are not rewritten.

Graph orientation: stale primary owner graph `46ec4108`, focused query for
`withoutAudienceRemarks`, exact current callers confirmed. Refresh only at
a relevant accepted integration boundary. Beads remains the status truth.
