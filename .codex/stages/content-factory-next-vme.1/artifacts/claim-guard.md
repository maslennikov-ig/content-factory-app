---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.1/stage-manifest.json
stream_owner: claim_guard_worker
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root acceptance for content-factory-next-vme.1
public_facade: published legal translations and public-claim contract guard
bounded_acceptance: paragraph-level machine reconciliation for all 48 legal files without weakening existing claim layers or allowlists
non_goals:
  - Legal wording changes, semantic legal review, or assigning language owners.
  - Locale JSON changes or changes outside the assigned write zone.
  - Beads closure, commit, push, merge, deployment, production, credentials, paid calls, or live calls.
evidence:
  - focused-red-green
  - mutation-check
  - full-focused-contract-suite
  - docs-check
  - owned-diff-check
task_id: content-factory-next-vme.1.claim-guard
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.1
session_id: goal-content-factory-next-vme
milestone: public-claim guard prose gap
milestone_status: accepted
agent_type: worker
subagent_model: inherited
reasoning_effort: inherited
model_reasoning_rationale: bounded local contract-guard and documentation stream
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 689491a3
worktree: /home/me/code/content-factory-next
write_zone:
  - tests/cloud-saas-contract.test.cjs
  - docs/operations/legal-translation-review.md
  - .codex/stages/content-factory-next-vme.1/artifacts/claim-guard.md
success_criteria:
  - One of the three accepted gap-closure options is selected and recorded.
  - A pure-prose paragraph added only to an unread translation fails the guard.
  - All 48 legal files remain structurally comparable and required.
  - The existing signal, phrase, and structure layers remain strict and their allowlists do not grow.
  - Legal wording and meaning are unchanged.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-vme.1/spec.md
  - .codex/stages/content-factory-next-vme.1/plan.md
  - .codex/stages/content-factory-next-vme.1/stage-manifest.json
  - graphify-out/GRAPH_REPORT.md
  - tests/cloud-saas-contract.test.cjs
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: vme.1-write-isolated-streams
depends_on_streams:
  - none
parallel_decision: shared-worktree write isolation defined by the stage manifest
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; temporary fixture directories were OS-managed and no branch, process, server, external session, or credential was created.
risk_level: medium
risk_tags:
  - public-contract
  - legal-surface
  - i18n
affected_surfaces:
  - contract-guard
  - legal-translation-workflow
invariants:
  - existing-three-layers-preserved
  - no-allowlist-expansion
  - legal-copy-unchanged
  - complete-3-by-16-matrix
docs_impact: new operator decision record
docs_reviewed: yes
docs_review_notes: Local repository contract only; external or version-sensitive documentation was unnecessary. Graphify root query reviewed cloud-saas-contract.test.cjs and legal translation paths before editing.
verification:
  - 'Initial RED on Node 22.23.2: focused pure-prose Turkish paragraph test failed because legalTranslationProblems returned no problem.'
  - 'Minimal GREEN: the same focused test passed after paragraphSkeleton was enforced.'
  - 'First full focused run exposed expected overlap with the pre-existing real-document signal fixture; that fixture was kept within its original paragraph so it continues to isolate the signal layer.'
  - 'Full focused GREEN after correction: tests/cloud-saas-contract.test.cjs passed 116/116.'
  - 'Mutation check: disabling only the paragraph comparison made the new focused regression test fail with the expected empty problem list; implementation was restored.'
  - 'Final focused GREEN after mutation restore: tests/cloud-saas-contract.test.cjs passed 116/116.'
  - 'pnpm run docs:check passed: 79 documentation files checked.'
  - 'git diff --check on the tracked owned diff plus whitespace and conflict-marker scans on the two untracked owned files passed.'
  - 'The writing-good-tests reference linked by the installed TDD skill was absent; its stated rules in the TDD skill were followed directly: real behavior, named production failure, focused RED/GREEN, and mutation proof.'
changed_files:
  - tests/cloud-saas-contract.test.cjs
  - docs/operations/legal-translation-review.md
  - .codex/stages/content-factory-next-vme.1/artifacts/claim-guard.md
completion_event: 398e2cce-d61b-47f0-9797-87fccfc83657
explicit_defers:
  - Rewording or adding a sentence inside an existing translated paragraph can preserve the skeleton and still requires a reader of that language.
  - Semantic legal review remains deferred to full launch in content-factory-next-sb1.
---

# Summary

Выбран исполняемый вариант из спецификации: машинная сверка по абзацам.
Текущие 48 юридических файлов имеют одинаковый каркас, поэтому страж теперь
сравнивает каждый перевод с русским источником по последовательности
заголовков, абзацев и списков, включая число пунктов списка. Полный набор из
трёх документов на шестнадцати языках закреплён отдельно: удаление файла больше
не скрывается запасным языком загрузчика.

Существующие сигнальный, фразовый и структурный слои не ослаблены. Реестры
исключений не менялись. Юридические тексты и locale JSON не менялись.

# Verification

Focused RED показал исходный дефект: отдельный турецкий абзац «сервис никогда
не будет прерван» проходил без замечаний. После минимальной реализации тот же
сценарий стал зелёным. Мутация, отключающая только новую сверку, снова сделала
его красным. Финальный файл `tests/cloud-saas-contract.test.cjs` прошёл 116 из
116 тестов на Node 22.23.2; проверка документации прошла 79 файлов, а проверка
пробелов и конфликтных маркеров на трёх изменённых путях завершилась без
ошибок.

# Risks / Follow-ups

Каркас не понимает смысл. Он обнаруживает отдельный добавленный, удалённый или
перемещённый абзац и изменение числа пунктов списка, но не отличает правку
смысла внутри уже существующего абзаца. Эта граница явно записана в
`docs/operations/legal-translation-review.md`; содержательная юридическая
проверка остаётся отложенной до полного запуска в `content-factory-next-sb1`.
