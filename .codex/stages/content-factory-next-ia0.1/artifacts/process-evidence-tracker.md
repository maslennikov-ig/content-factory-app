---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0.1/stage-manifest.json
stream_owner: process_evidence_tracker
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root acceptance owner
public_facade: durable branch pin, evidence manifest, and Beads successors
bounded_acceptance: focused branch-pin regression, exact evidence hashes, successor readback, and proposed close-reason ledger
non_goals:
  - landing-page design or conversion implementation
  - implementation-stream code or accepted worker artifacts
  - reopen or close existing Beads
  - merge, push, PR, deploy, production, credentials, or paid calls
evidence:
  - ia0-auth-evidence-correction
task_id: content-factory-next-ia0.1.process-evidence-tracker
epic_id: content-factory-next-ia0.1
stage_id: content-factory-next-ia0.1
session_id: content-factory-next-ia0.1
milestone: process tracker and evidence honesty
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: local process evidence and tracker correction assigned by root
repo: content-factory-next
branch: codex/remaining-epic-acceptance
base_branch: codex/remaining-epic-acceptance
base_commit: 80300ed6899490dca5e0f6ec82492bbc9776828e
worktree: /home/me/code/content-factory-next
write_zone:
  - tests/desert-lab-screen-review.test.cjs
  - .codex/stages/content-factory-next-ia0 evidence and visual claims
  - .codex/stages/content-factory-next-ia0.1 except accepted worker artifacts
  - .codex/handoff.md
  - seven new successor Beads only
success_criteria:
  - durable delivery branch remains main independently of feature or detached checkout state
  - invalid light-1024 screenshot is withdrawn and prior browser scope is stated as /auth only
  - remaining g1d, 5fn, and 34r work has bounded open successors
  - all 17 replacement close reasons are evidence-specific and prepared without reopening or closing existing Beads
  - second-tier defers are explicit
selected_docs:
  - AGENTS.md
  - accepted ia0 stage artifacts and evidence manifest
  - current Beads records for the 17 assigned ids
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: ia0.1-process-after-implementation
depends_on_streams:
  - migration-recovery
  - relay-billing
  - ui-error-guards
parallel_decision: sequential after implementation writers stopped
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
orchestrator_acceptance_notes: root inspected the branch-pin regression, corrected evidence hashes and claims, eleven successor readbacks including four durable defers, exact 17-reason ledger, scope boundaries, and cleanup; accepted before the root-owned single Beads batch
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch, worktree, temporary file, browser process, or runtime tail remained
risk_level: medium
risk_tags:
  - rollback
  - ui
affected_surfaces:
  - none
invariants:
  - test-matrix
  - rollback
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: corrected the accepted visual-evidence scope and current handoff without changing product behavior
verification:
  - TMPDIR=/tmp pnpm exec jest tests/desert-lab-screen-review.test.cjs --runInBand RED: 52 passed, branch-pin assertion failed against feature checkout
  - TMPDIR=/tmp pnpm exec jest tests/desert-lab-screen-review.test.cjs --runInBand GREEN: 53 passed
  - sha256sum and file on ia0 design evidence: invalid light-1024 proved 390x844 and byte-identical to dark-390-long-en
  - bd show qn4 mzh k21 2id s96 qzw den: all seven successors open with exact discovered-from links
  - bd show wui rpt 8e7 6er: all four defer successors open with exact discovered-from links
  - python3 scripts/orchestration/validate_artifact.py on this artifact: passed
  - python3 scripts/orchestration/lint_stage_sizing.py --stage content-factory-next-ia0.1: passed
  - run_process_verification.sh scoped to this artifact: passed
changed_files:
  - tests/desert-lab-screen-review.test.cjs
  - .codex/stages/content-factory-next-ia0/evidence/design-consistency/README.md
  - .codex/stages/content-factory-next-ia0/artifacts/design-consistency.md
  - .codex/stages/content-factory-next-ia0/summary.md
  - .codex/stages/content-factory-next-ia0.1/plan.md
  - .codex/stages/content-factory-next-ia0.1/artifacts/process-evidence-tracker.md
  - .codex/handoff.md
explicit_defers:
  - content-factory-next-wui owns the Docker-absent CI contract; real Docker proofs passed, while legitimate local no-Docker runners still need an explicit non-silent mode.
  - content-factory-next-rpt owns privacy-reviewed per-client relay budgeting because the current contract supplies no stable client identifier.
  - content-factory-next-8e7 owns authenticated channel-picker dark-theme evidence with a seeded local fixture and no production credentials.
  - content-factory-next-6er owns immutable exact YouTube primary provenance or the explicit decision to retain raster.
completion_event: 31c48774-1631-4378-8180-f1d54f284321
---

# Summary

The orchestration regression now checks the durable `main` delivery pin rather
than equating it with the branch currently used for review. The RED was the
actual feature checkout; GREEN passes 53/53 and the assertion no longer depends
on `git branch --show-current`, so detached HEAD is also valid.

The ia0 evidence manifest and accepted visual claims now say exactly what the
files prove: browser evidence covers `/auth` only. Dark has four control widths;
light has 1440/768/390. `auth-light-1024.png` is withdrawn because both `file`
and SHA-256 prove it is the same 390x844 payload as
`auth-dark-390-long-en.png`. The binary is retained only to keep the accepted
history and its correction reviewable.

Eleven open successor Beads keep the unfinished work visible:

- `content-factory-next-qn4` — remaining raw Tailwind palette from `g1d`;
- `content-factory-next-mzh` — remaining Postiz aliases and `colors.scss` bridge from `5fn`;
- `content-factory-next-k21` — Analytics and platform analytics from `34r`;
- `content-factory-next-2id` — Settings and Admin from `34r`;
- `content-factory-next-s96` — product-owned Billing chrome from `34r`;
- `content-factory-next-qzw` — Developer and Public API from `34r`;
- `content-factory-next-den` — Preview, Extension, and Provider OAuth runtime boundaries from `34r`.
- `content-factory-next-wui` — Docker-backed execution-suite CI contract from `ia0.1`;
- `content-factory-next-rpt` — privacy-safe per-client relay budget from `ry5.10`;
- `content-factory-next-8e7` — authenticated dark channel-picker evidence from `55n`;
- `content-factory-next-6er` — immutable YouTube provenance or explicit raster decision from `gur`.

# Proposed replacement close reasons

Root may use these exact individual reasons in the single reopen/close batch.
No existing Bead was reopened, edited, or closed by this stream.

- `content-factory-next-3gn`: `Legacy form/checkbox.tsx удалён; его потребители переведены на CheckboxField с общими cf-токенами, фокусом и mobile hit target. Остаток raw-control реестра относится к file/range/primitive/third-party границам и не приписан этой задаче.`
- `content-factory-next-c7l`: `Branding fixtures перенесены из обходящегося дерева в os.tmpdir(), а временные symlink-точки живут до afterAll; focused 3 suites 53/53 и пять параллельных повторов branding+purge прошли без ENOENT.`
- `content-factory-next-uck`: `Shrink-only typography ledger уменьшен без новых ручных значений; guards и shared-control проверки прошли, а platform preview typography сохранена как явно ограниченная внешняя имитация.`
- `content-factory-next-8ix`: `Legacy checkbox удалён и подходящие raw inputs переведены на общие контролы; allowlist сокращён с 47 до 33, а оставшиеся file/range/primitive/third-party случаи имеют явные причины и не могут расти незаметно.`
- `content-factory-next-e7t`: `Новые Errors сохраняют минимизированный payload без post body, секретов и лишних персональных данных; owner-run dry-run/apply cleanup и 90-дневный retention идемпотентно нормализуют историю, сохраняя Admin Stats и per-post error semantics.`
- `content-factory-next-5fn`: `Добавлен shrink-only guard для словесных Postiz aliases и число legacy-вхождений уменьшено; оставшиеся aliases и несокращённый colors.scss bridge честно продолжены в content-factory-next-mzh.`
- `content-factory-next-ry5.10`: `Browser SDK отправляет закрытый payload только через same-origin relay; реальный client fetch больше не задаёт no-referrer и browser POST проходит строгую Origin-проверку. Proxy logging, payload privacy и collector-outage isolation покрыты; per-client budget отдельно отложен из-за отсутствия privacy-safe ключа.`
- `content-factory-next-ry5.2.1`: `Newsletter consent хранится как durable pending transition и доставляется новой versioned Temporal activity с атомарной арендой, bounded retry, expiry recovery и idempotent transition identity; отсутствие consent не создаёт retry и адрес не попадает в workflow history или логи.`
- `content-factory-next-nhq`: `Shared controls владеют 40/32px visual height и 44px mobile hit target; call-site height overrides удалены, DESIGN уточнён, а AST/runtime guards закрывают alias, arbitrary и inline height bypasses.`
- `content-factory-next-ue2`: `Backup-wrapper test теперь capability-checks executable-bit preservation в том же temp filesystem и пропускает только зависимый случай; production guard не ослаблен, ext4 focused suite прошёл.`
- `content-factory-next-g1d`: `RAW_PALETTE_ALLOWED уменьшен и shrink-only guard предотвращает новые raw Tailwind colours; основная оставшаяся миграция 142 исходных вхождений не объявлена завершённой и продолжена в content-factory-next-qn4.`
- `content-factory-next-34r`: `Section-six inventory теперь честно помечает каждую поверхность migrated или deferred с конкретной runtime/data причиной; незавершённые области разделены на content-factory-next-k21, 2id, s96, qzw и den, поэтому browser coverage для них не заявляется.`
- `content-factory-next-rgf`: `Radius guard распространён на app и shared-library JSX, включая named rounded-2xl/rounded-3xl и arbitrary oversized values; существующие отклонения учтены exact-count/shrink-only проверкой и новые не проходят.`
- `content-factory-next-55n`: `Шесть ручных avatar/platform связок переведены на общий PlatformBadge; logo crop/recolour guards зелёные, Calendar показывает четыре отметки и доступный +N, а YouTube остаётся внутри общего asset resolver.`
- `content-factory-next-gur`: `Четыре разрешённых official SVG скопированы byte-for-byte из immutable first-party sources и hash-checked; общий resolver выбирает их без перерисовки, а причины сохранения остальных растров записаны. YouTube vector не заявлен без точного primary provenance.`
- `content-factory-next-sek`: `Успешная отмена подписки пишет ровно один private cancel_subscription по transition token; direct и signed-webhook recovery дедуплицируются, storage failure остаётся retryable, а admin view не раскрывает персональные данные.`
- `content-factory-next-ry5.2.2`: `Product и Mastra работают под раздельными non-owner runtime roles и databases с disableInit; owner-run migration теперь берёт DDL из реальной source DB и до мутации дважды сверяет точный набор 29 таблиц. Backup/restore восстанавливает database ACL и cross-database CONNECT isolation.`

# Verification and boundaries

Node was 22.23.2, pnpm was 10.6.1, and `TMPDIR=/tmp` for the focused Jest
target. Beads readback showed all eleven successors open with the intended
`discovered-from` sources. No close/reopen, owner-blocked record, `71m.7`, parent
epic, `or3`, landing branch, production system, credential, remote, or external
account was touched.

# Risks / Follow-ups / Explicit Defers

The four remaining second-tier gaps are explicit open Beads in the header:
`wui` for Docker-absent policy, `rpt` for the per-client relay budget, `8e7` for
authenticated channel-picker browser proof, and `6er` for YouTube provenance.
All other named cheap findings were handled by their
owning streams: source-DB Mastra DDL replaced Compose export, cleanup became an
array transaction, Input no longer reserves a standalone empty gutter, and the
design guard now scans shared libraries, wider aliases, and `rounded-3xl`.

Root still owns artifact acceptance, the single release command set, the one
Beads reopen/close batch, `bd dolt push`, and final readback.
