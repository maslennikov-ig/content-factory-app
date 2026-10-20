# Content Factory current handoff — 19 October 2026
Task authority (owner, 2026-10-16): Linear is canonical, Hoba is the intake; linked tasks follow same-team project moves, marked `linear-project:<slug>`; Beads is the agent interface; GitHub is the subordinate mirror. Component: `content-factory`; migration epic: Helixa `helixa-2-lab-2xs0s`. Check bridge status for `preparing` versus `active`. Older Beads-authority wording below is historical. See `AGENTS.md` and managed `docs/runbooks/linear-task-sync.md`; product work/gates stay intact.
Server task-sync cutover, 2026-10-16 (`helixa-2-lab-03z66`): the sole publisher and native Beads databases are on `helixa-new` (82.26.152.8). Local `bd` uses the protected SSH connection; both Windows sync tasks are disabled. Local bridge checkpoints are diagnostic copies. Use the managed task-sync runbook for the live server status and recovery; never reinitialize the selected databases.

Owner-authorized j9p5 implementation and production acceptance completed19Oct: private sourceadb43f973576/public-productiondd89af1b4a29, verified rollback88867e1cb4c7. All9root and5public CI checks pass (Jest12619/Node126/Python50); natural production model selection -> saved/opened/read draft plus13chat/navigation checks pass, original messages/pending/workspace exact. Six actual usage rows succeeded/no unknown costs, modelopenai/gpt-6-luna/Exa advanced unchanged; actual partial research status preserved. Schema0SQL0/no apply, Mastra45/product77 fingerprints unchanged;17foreign containers/21volumes exact;25040601088free bytes after canonical own-only retention. Helpers/session removed. All9children and epic canonically Done at10:57UTC;2preexisting unrelated global graph conflicts preserved. [Delivery](stages/content-factory-next-j9p5-implementation-20261018/production-delivery.md); exact root verdict: stages/content-factory-next-j9p5-implementation-20261018/evidence/root-acceptance.json. Prior C4A incomplete controls remain historical.
## Assistant chat sidebar follow-up

Owner19Oct latest steering: local testing only, no source/image publication or
deployment. Prior release authority is explicitly on hold. Nothing was pushed,
built as an image or switched; production staysdd89af1b4a29. Audit
`content-factory-next-2512`: [native harness findings and next implementation](stages/content-factory-next-2512-native-harness-20261019/audit.md).
Epic `content-factory-next-on0i` and all seven children (`on0i.1`–`on0i.7`) are
locally implemented and verified on `codex/on0i-native-harness-implementation-20261019`:
Mastra `1.78.0` upgrade + isolated `AgentController` sessions (`on0i.1`),
`toModelOutput` compact evidence (`<=12k`/`<=6k` chars) with full UI/DB sources
and `piece_create_from_research`/`facts_read`/`piece_material_add`/`piece_adapt`
(`on0i.2`), durable execution + `/stop`/`/signals`/`/stream` reconnect and
idempotent recovery (`on0i.3`), native `ask_user`/`submit_plan`/`task_*`/goals/
bounded subagents/`defineSchedule` follow-ups (`on0i.4`), native `ModelWithRetries[]`
routing/retries/fallbacks and metered accounting (`on0i.5`), product UI controls
(`on0i.6`), and `/observability` + full `A1`–`A31` acceptance matrix (`on0i.7`).
[Plan](../docs/superpowers/plans/2026-10-19-native-mastra-harness.md), [outcome](stages/content-factory-next-on0i-native-harness-20261019/implementation-outcome.md), [receipt](stages/content-factory-next-on0i-native-harness-20261019/root-acceptance.json).

19Oct `content-factory-next-rafo`, `codex/chat-sidebar-20261019`: locally implemented
the owner-requested collapsible chat list under AI assistant, new-chat plus at
right, and removed the persistent archive above messages. Shared native list,
existing routing/drafts/management and mobile drawer retained; no new runtime
dependency or model/backend change. Focused11suites/142tests and frontend types
PASS. [Local outcome and browser evidence](stages/content-factory-next-rafo-chat-sidebar-20261019/outcome.md).
Localbuild/types PASS; Jest12626/Node126 PASS, Python50 PASS after doc-length correction.
Original combined receipt failed; no new release receipt/publication claimed.
Original checkout dirty docs and all prior evidence preserved.

## AI assistant implementation

Manual-width follow-up `content-factory-next-tgeq` /HOBA-5835 canonically CLOSED: testedce4a5895ccc5/public-production 88867e1cb4c7, accepted18Oct17:20UTC. All9root/5CI/3suite halves PASS (Jest12492/70existing skips,Node126/0fail,Python50);42actual2221/390px width cases PASS incl manual avatar/channel/material/adaptation and shared assistant editor. Core783→1517px/input761→1925/settingsfields560→1393; no overflow,0model/0domainwrites, original/QA/history exact and workspace restored. Actual facts collection empty; row styling source/suite only. Registry80e5/config06a4/archive12867752bytes SHA1e972 exact; schema0SQL0/no apply, healthy0/3online0/Mastra45same/21foreign containers+21volumes. Canonical retention kept888+rollbackda82/config4797, removedonlyownebdd/2old4fcopies; hashedhelpers/session removed, browser/cookies closed;25,223,315,456free bytes. [Delivery/receipts](stages/content-factory-next-tgeq-width-20261018/production-delivery.md). Prior assistant-only widthnds6/HOBA-5834 acceptedda82 remains [historical](stages/content-factory-next-nds6-width-20261018/production-delivery.md); prior paid epic evidence below unchanged.

Owner16Oct selected «ИИ-помощник» across all16 locales. Epic `content-factory-next-jvrq` /HOBA-2540 and all20children are canonically CLOSED; normal-flow delegated A1–A10 acceptance is preserved. Personal owner/client/external observations remain separate.
Prior accepted runtime18Oct13:29UTC: private dd67538d524417749bc46935ffb84431bc3da42f/public ebdd0fdd6d86d44152465f72e678e429d0387715, registryc1d1/config2114. Exactall9/all5CI/full3suitehalves PASS (Jest12492/70skip,Node126/0fail,Python50). Full12865844byte production archiveSHA0f1437 matches image. Schema0SQL0/no apply; healthy0/3online0/Mastra45fingerprint4739/21foreign containers+21volumes exact;25,217,040,384free bytes. Verified4f/config812 rollback retained; canonical retention removedonlyowna20/5efa/1bf and6old configcopies. Historical17Oct A1–A10 evidence remains in outcome/map, not a current-runtime assertion.
Delivery18Oct: e6rj/HOBA-5826 canonicallyCLOSED; wc6o/HOBA-5827 canonically CLOSED (managed server13:37UTC). Actual fresh avatar→existing testgroup→new named piece/questions/separate answers→manual avatarv2/chatv3/channel/core controls accepted composite.4f proves retained draft/DOM on focus/route0modelPOST, inline fresh revision, native preview/history and actual paid resumeStop running/locked→explicit settled/interrupted,1POST/no replay; accepted write preserved once. Finalebdd native approval2streams200DONE/pending0/completed now reports avatar already disabled. Main1218/shared/freshmanual/API/DB exact; all originals/default/priorrecords preserved/channel fully restored.19ledger rows terminal17success/2intentionalStop failures,known0.02761769USD notinvoice;2possiblyBilled. Browser/cookies/session/RPC/3hashedhosthelpers closed; releaseWT/image/archive/privateaudit kept. Global managed relation sync remains exit1/local-graph-pending for e6/wc, recorded bounded external defer; selected statuses are separate. No local publisher/DB reinit/edge deletion.
Target: `docs/product/chat-first-workspace-spec.md`; plan: `docs/superpowers/plans/2026-10-16-chat-first-workspace.md`; accepted design: `docs/design/chat-first-workspace/prototype.html`. Current evidence: `stages/content-factory-next-jvrq-implementation-20261016/acceptance-map.md`. Historical16–17Oct releases, OPEN checkpoints, failed controls and corrections remain in that stage's `outcome.md` and evidence; they are not current runtime/task statements. Latest delivery: `stages/content-factory-next-jvrq-implementation-20261016/production-delivery-20261018.md`; scoped follow-up plan: `stages/content-factory-next-jvrq-implementation-20261016/production-repair-20261018.md`.
Current stage id: content-factory-next-j9p5-implementation-20261018

## Shared-host artifact lifecycle delivered

Current stage id: content-factory-next-host-artifact-lifecycle-20261014 Beads0qgn.24 /producer beads_fmcg_kp-qaa3; original contracts/other statuses retained. AiDevTeam ops source2283eaae5 pushed/main/host installed; source-only, no app rebuild. CF
still0e8f25e5fe9f/verified rollbackec58; AiDevTeam app3153/image84520a37 unchanged. Canonical deploy now prepare/admit before build, finish after readiness; same custom contract. Keep3 latest distinct rollbacks +3 documented pins +all container references;
exact removals only. Unused cache older24h toward4GB; fresh/in-use cache kept. Build needs16GB/100k inodes. Unknown capacity/pin/identity, active build or failed readiness refuses unsafe work. Root22 Python +101 CF regression PASS; syntax/compile/diff PASS;
frontend build proof reused. Actual two obsolete tags/cache cleaned: ~9.24→17.82GB;22 containers/20 volumes/live files preserved. Installed check/prepare dry-run/actual finish PASS; hashes/source and CF/website health exact. No daemon/scheduler, app
restart/switch, DB/backup/model/provider/message QA. Owned host temp/worktree removed;12 unrelated producer modified files preserved. Outcome/root proof: stages/content-factory-next-host-artifact-lifecycle-20261014/. Original actual owner Telegram login/client
acceptance remains unverified; use fresh /auth/login. Previous13Oct repair2q28.43/.44/.45 delivered; details in login-flags-repair-20261013/outcome.md. No continuous goal/next work running; resume owner testing, leave original epics/defers unchanged.

Owner12Oct explicitly approves independent Skool publication defer and epic closure. Epic and all36 technical children CLOSED; task32 independent DEFERRED, not completed. Original38 task contracts unchanged; approved defer recorded in Beads, the authority. Previous dbxe source2e357374d91a/ec58 proof stays historical, not restamped.
Rejected38c compiler gap, corrected c886 proof and successful2a rollback retained.
30 old-key401/new-key200 and31 empty V2->V3 cutover remain actual accepted operations.
Global34/8 retain2 disabled-caller exceptions;33/35 retain native/allocator triggers,
not a universal patched claim. Four clean owned child worktrees removed; proofs and
branches kept, release worktree retained. All unrelated work preserved.
Store2.0.1 package/native fixture is distinct from CWS approval; EXTENSION_ID unset.
Outcome/runtime/CI/status proof: stages/content-factory-next-dbxe-completion-stage/.
Unrelated epics/defers open; no paid/provider/mail/social/restore QA or metadata full rerun.
Accepted stage id: content-factory-next-dbxe-completion-stage

Historical publishing/dependency acceptance is preserved in
[the archived handoff excerpt](stages/content-factory-next-2512-native-harness-20261019/historical-operations-handoff.md).

## Previous accepted access stage

Previous stage id: content-factory-next-dbxe-access-stage
Bounded dbxe.1–.5 accepted locally in codex/audit-readiness-20261009;
Beads owns current child statuses; dbxe.1–.6 and8 CLOSED, epic OPEN.
Organization list projects safe fields, reset/session/activation purposes are
separate, reset uses 20min exp/password-hash CAS, legacy OAuth rechecks current
tenant membership/role, cookie mutations fence Origin, provider fan-out scopes
tenant+explicit family. Existing full-user sessions/organization keys retained;
old untyped reset links require a new letter. No schema/secret rotation, provider
call, production mutation/deploy, remote source push or customer messaging.
Compatibility: docs/operations/access-token-migration.md.
Stage plan/evidence: .codex/stages/content-factory-next-dbxe-access-stage/.
Root follow-up review corrected dbxe.5 primary-write provider collision with
an atomic predicate/HTTP409, preserving existing channels under concurrent
connections. Latest review: access-stage/review/review.md and
review/review-acceptance.json. Root acceptance:34 suites/558 tests, zero skip,
including11 real PostgreSQL tests; backend TypeScript, docs/process/diff checks PASS. Owned disposable DB
removed, foreign container IDs preserved. Fresh unauthenticated public GET:
API/login/source200; source stillcae3. This is availability, not live fix proof.

Audit09Oct remains historical: source5189430f1 equaled tested e2ec588d inputs
before this stage. All other dbxe children/old epics and acceptance gates remain
unchanged. Original findings:
.codex/stages/content-factory-next-audit-20261009/audit-report.md.

Fresh09Oct runtime read confirms exact active image/source/schema/native roles,
healthy DB and all32+main pollers. Disposable native-image probe proves pending
read-only workflow resumes after worker start and supervisor restarts a SIGKILLed
worker. Image health stays green with that worker stopped: dbxe.7. These are not
provider exactly-once or live-host recovery claims. Fresh disposable PostgreSQL
checks20/20 pass, zero skip; all owned probe resources cleaned, foreign IDs kept.
Official lockfile range lookup has323 matches/69 package names, applicability
untriaged: dbxe.8; failed pnpm audit heap OOM is not a passing audit.

Accepted08Oct proof stays historical for unchanged inputs; no full suite restamped today.

Historical08Oct public `cae3cd8340e06058365a9c9adca8194858abbb12`, tested private
`e2ec588dca449dcbaefe1b2a56ef42bcb2408a6d`; registry index
`53cefe055fa9c3a2559afbb2f029932836d391715c53805132c1ac246ea669b0`, image
config `a70e865a332aeae3701bfabc5fbb97f9c9b1d04596ab64536fa3c8eef0e8a053`.
App `3d0effee1ab4dc018955e539c050c25834a0ae6d4fbb9d6fb27e1a1c6ec7d083`,
healthy/0restarts, native backend/orchestrator/frontend. Verified local rollback
`4a8e57d96545`/config`b0a30d6627a3`. Only app changed;21 other containers preserved.

Reader now uses one practical natural-prose/reference/gaps synthesis. Fresh3
retained-source model and3 retrieval replies pass root semantic review; partial
gaps are honest, no universal entailment certificate. Fact-effective-asof allows
later retrospective articles/free translation. No new query/discovery refactor.
Adaptation now persists before locked per-channel placement; empty schedule
leaves a useful DRAFT/actionable note. Fresh A1 from empty space to reserved post
passes via13 chat POST: manual6 fields, CORE/answer,306-char DRAFT, explicit
10Oct18UTC reserve/no publication/unchanged text. Exact1agent+1extract+1draft for
adaptation;26 final usage rows terminal, no pending. Four artifact types plus
reserved-adaptation context open beside;1440/390 pass, guidance control visible.
Frontend tree identical to previously delivered feedback/loader/rewrite UI.
Style.17 accepted INCONCLUSIVE→RETAIN_CURRENT; defaults12/20/28/profiles preserved.

All9 configured release checks PASS:629 suites/11493 Jest, Node122, Python50;
9 Jest/4 Node skips explicit. All5 publicCI jobs PASS (including native31,
full3 halves, calendar+400 and CodeQL). Image308 logic tests PASS;29 additional
permission tests use readonly docs missing from runtime. Nginx PASS; commands
help uses disposable no-network Prisma-connect stub, not a DB/CLI functionality
claim. Source/archive/bundles exact; archive12485122B/SHA
`aaa8594fb03fbe1947eb25e842d5df0087f97194d12b0cb35402b39a9e7ca089`.
Prisma pre/post diff0, SQL not applied; Product77/Mastra45 fingerprints exact.
Retain-host-artifacts now requires explicit verified rollback; activecae3 and
rollback4a8 kept, only obsolete ownf26/four allowlisted copies removed. Earlier
same script freed17.5GB, all live config/container identities preserved.

Owned actor disabled/password removed/session401; only inert synthetic channel
retired, CORE/post/derivation/usage history preserved. Exact own host/app helpers
and local credentials removed; no restored backup/real social connection or
publication/customer messaging. Natural8Oct encrypted scheduled backup metadata
success/nonzero0600 accepted; metadata alone is not restore/offsite proof.

Memory acceptance PASS:31samples/1830.10sec,56.79–57.58% Docker-equivalent; original strict<60,1792MiB.
Fresh connected baseline is2 non-owned active channels (historical1 is stale);
all32 provider activity queues+main,1792MiB cap/native identities preserved.

Evidence: `.codex/stages/content-factory-next-0qgn-completion-20261008/`:
root-acceptance.json, outcome.md, operations-root-acceptance.actual.json,
product-root-acceptance.actual.json, reader-retrieval-root-review.actual.json,
public-ci-root-acceptance.actual.json, hot-memory-cae3/. Raw/private evidence is
local/untracked; no active credentials remain. Original pre-pass/history remains
in pre-pass-handoff.md and earlier stage receipts. No old C27/native runner replay.

## Next recommended
Next stage id: awaiting-owner-testing-results
Recommended action: unrelated client acceptance after completed jvrq — owner follows the portal guide; next session pulls actual results and fixes concrete defects in one short stage.
Preparation: Beads2q28.42 CLOSED; outcome/prompt in stages/content-factory-next-client-test-prep-20261012/.
Portal project content-factory, slug content-factory-owner-testing-2026-10;
URL only in that stage's publication.local.json (private, excluded from Git).
Three short cases +loader/AI instructions/manual-save checks;15–20min.
Old Julia pagev6/two tokens and existing answers preserved; no owner answers fabricated.
Owner13Oct reported Telegram/flag defects; delivered repair is recorded above.
Resume owner/client testing on current5efa with fresh sign-in; old callback must not be reused.
Previous ops5.2 accepted: exact native recovery/auth/accounting/telemetry;
metadata1054rows/476known/578unknown/0pending, active90daytimer lastsuccess.
Not invoice completeness or future sizing. Owner explicitly defers finance and
30-day error retention; original0qgn.5 BLOCKED on defers/offsite destination/key.
Original71m.8 connected memory and0qgn.1 scheduled backup CLOSED, not reopened.
Task32 independent DEFERRED;2q28/client acceptance remains OPEN. Wait for actual
owner results; no continuous epic goal, portal polling, new paid/provider calls.

## Explicit defers

Beads content-factory-next-e3nj tracks historical untracked-evidence marker false positives; old logs preserved. Historical jvrq.9 failure was repaired/closed; .10 dialogue and .11 automatic title are delivered. Current jvrq delegated full-flow acceptance passes; jvrq.12–.20 are delivered and canonical final closure is recorded in its stage; earlier negative controls are historical.
Beads24/25/37/28/36/29 CLOSED and delivered;30/31 actual operations retained.
Store32 independently DEFERRED by owner12Oct. SDK history retains payloads; no global
retention/privacy/host-loss recovery claim. Historical logs/markers remain unchanged.
dbxe.14 canonical Python ZIP/native controlled browser PASS, not store acceptance.

Owner-deferred: legal operator/region/support/Terms/Privacy, pricing/trial/payment,
actual ChatGPT login(kcxz.46), external copy/key custody. Claude unavailable;
root delegated verifier. Real-client Julia publication/personal feedback is not
replaced by technical/owned QA; portal-only feedback choice retained.
Manual9 saved samples0qgn.3 accepted; historical cohort/accepted-reference
population unknown(m0iy.10), so phase2m0iy.6/m0iy.7 remains gated. No phase2
implementation or tariff/legal fiction introduced. Epic kcxz retains external
ChatGPT acceptance;2q28 retains actual client acceptance.

## Starter prompt for next orchestrator

Read stages/content-factory-next-client-test-prep-20261012/new-session-prompt.md and outcome.md. Use $orchestrator-stage when coordination materially helps.
Preparation2q28.42 is separate from owner results; inspect fresh Beads before action.
Audit dbxe CLOSED; independent32/finance/30-day/legal/pricing/ChatGPT/offsite/research defers retained.
Use portal-artifact to pull only new owner form; never put bearer URL/client answers in Git.
If final answers are absent and owner gave none in chat, report ready and wait.
Preserve healthy5efa/verified rollback1bf, V3/digest runs, foreign work and original contracts.
Reuse matching full9/publicCI/runtime evidence; release only for concrete changed application inputs.
graph-reviewed: used - focused TelegramProvider query; existing symbol boundaries unchanged.
Repair outcome: stages/content-factory-next-login-flags-repair-20261013/outcome.md.
Root-owned closeout; metadata-only source delivery is separate from accepted image.
