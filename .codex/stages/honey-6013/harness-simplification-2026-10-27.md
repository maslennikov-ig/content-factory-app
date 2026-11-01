# Research continuation and harness simplification

Task: `content-factory-next-v8ie`. Accepted locally, no delivery.
App source: `872e21cd422489d648978ece92b2a3ed25ff0384`.
[Plan](../../../docs/superpowers/plans/2026-10-27-agent-harness-simplification.md).
[Original diagnosis](live-research-audit-2026-10-27.md).

## Result

- `piece.create.from-research` is an adapter to `piece.create`, with one selection contract. References can include exact retained passages. `IntakeService` normalizes owned native-intake and standalone captures; models need not know their storage prefixes. Original author plans, fixed answers, task boundaries, evidence identity and context are retained.
- Source selection preserves both the actual selected evidence and original research assessments/gaps. Old passage snapshots recover their parent's assessment in a read view without changing stored history. Supplemental context reaches the writer as untrusted reference material, separate from author answers and verified facts.
- Selected research no longer buys another brief-sufficiency verdict or gets vetoed by a stale pre-search insufficiency flag. Meaningful author questions still defer writing through the existing native flow. A fresh insufficient brief without questions/usable selected evidence still cannot manufacture missing private data. An empty selection is not sufficient research.
- Server-proven pre-effect refusals receive existing input-revision semantics in one tool-adapter location. Native Mastra corrects the input. No new retry engine or terminal state machine. Fatal effects, uncertain writes, lost settlement receipts and Stop retain their protection.
- Active brief prompt v14 is flat, with one data envelope and the existing schema/native structured generation. For the same small fixture it is 3,118 characters versus 10,736, down 71%. Archived prompts remain importable for historical contracts; runtime does not concatenate them. This is a character measurement, not a measured token/cost improvement.
- Selection-error copy accurately names failure to apply a saved selection instead of asserting that facts contradict sources. Existing Russian/English content-copy bases and locale resolution are reused.

Mastra already owns Agent execution, structured generation, Memory and question suspend/resume. The failures were in our evidence adapters and outcome accounting. Installed core is 1.78.0; no dependency/SDK upgrade was needed. Context7 `/mastra-ai/mastra` and installed source confirmed [native tool-error correction](https://github.com/mastra-ai/mastra/blob/main/packages/core/src/loop/workflows/agentic-execution/llm-mapping-step.ts); the free native integration proves it for the installed version.

## Acceptance

Root command:

```bash
pnpm exec jest --runInBand --coverage=false \
  tests/intake.research-reuse.test.cjs tests/intake.model-led.test.cjs \
  tests/intake.provider-schema.test.cjs tests/intake.author-request.test.cjs \
  tests/agent.model-intake-composition.test.cjs tests/agent-lifecycle-accounting.test.cjs \
  tests/agent-capabilities.adapters.test.cjs tests/agent-capabilities.w2-fixes.test.cjs \
  tests/agent-domain-questions-native.test.cjs tests/agent-native-stop-settlement.test.cjs \
  tests/agent-native-stop-orphan.test.cjs tests/agent-provider-terminal-errors.test.cjs \
  tests/agent-progress-copy.test.cjs tests/core-write-period-update.test.cjs \
  tests/core-write-v16.test.cjs tests/core-write-v15.test.cjs
```

16 suites / 280 tests PASS. Includes actual native Mastra with controlled free transports, question partial-answer/SIGKILL recovery, revised arguments followed by completed settlement, fatal/uncertain effects, Stop and durable terminal acknowledgement. Owned temporary test schemas were removed by existing helpers.

Backend and frontend `pnpm exec tsc --noEmit --incremental false -p apps/<backend|frontend>/tsconfig.json` both exit 0, empty logs. Documentation links and `git diff --check` pass. No full build, release suite, push or deploy.

Additionally, all three actual saved owner inputs were replayed through current tool/domain code against copied original captures in an isolated Map and a controlled free writer. First attempt now keeps 14 selected facts/passages, second 11, native-only continuation 8. Each writes once, carries supplemental context and returns the identical result on repeat. Provider/search calls and owner-store writes: zero. This proves routing/provenance/recovery; it does not certify newly generated model text.

Child `preflight_recovery`: adapter delivery accepted, own focused 3 suites/63 tests reused in integration; read-only review found lost legacy passage assessments and empty selection admission. Both fixed with regression proofs in root acceptance. No child services, commits or retained schemas; no broad cleanup.

## Local runtime and preservation

[Local stand](http://localhost:4337/agents), backend 3516. Configured real APIs remain in use: primary/advanced Terra 6.1 medium, Luna for classification. No provider override or local model was added.

Only the identity-verified owned backend was gracefully replaced (28914 -> 88711). The one unfinished pointer was waiting for a native question, with no active inference/queued continuation. Native suspended work remains suspended. Frontend 29932 and foreign listening services are unchanged.

Before/after comparison of all 22 chats confirms equal projected messages, pending questions and execution state. Existing CORE, adaptation and DRAFT match the audit snapshot. All 12 protected original dirty-file hashes are unchanged. No new usage rows since audit start, including after bootstrap. Existing error history and the prior failed outcome were intentionally not rewritten.

Private receipts/logs/helpers: `/home/me/.local/state/content-factory-next/honey-6013-20261027/cba-audit/`. They contain owner data and remain outside Git. Native process receipt records the accepted source commit.

## Limits

Real-provider semantic/editorial qualification remains `content-factory-next-eqh5`; no new paid model/search run was performed. The malformed historical brief was preserved, not word-filtered or rewritten. A flatter prompt is not proof that a model will never return a semantically poor field.

Direct source fetching remains disabled in this stand. Existing read/search capabilities and explicit source gaps remain truthful. No capability or credentials were changed. Compositions are bounded to eight original captures, 200 selections and one original native intake plan; nested bundles are not accepted as fresh independent captures. These bounds and existing actor/source ownership/atomic claims remain safeguards for data and effect identity.

Historical recovery/card contracts remain readable for existing messages. They are compatibility, not a second current quality gate. No mandatory interview, content-word blacklist, topic router, automatic paid repair/review, extra runtime or new dependency was introduced.

docs-reviewed: updated - implementation, retained boundaries, owner-case proof and handoff.
graph-reviewed: used - borrowed owner graph at dd67538d was stale for IntakeService; focused query returned no neighbors, current exact source owns findings. No external extraction or graph refresh.
