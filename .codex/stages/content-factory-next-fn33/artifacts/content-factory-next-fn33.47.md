---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-o-assistant-refusal-devindicator
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: the development stand
public_facade: n/a
bounded_acceptance: the development indicator no longer sits over «Выйти»
non_goals:
  - moving any product control
evidence:
  - none
task_id: content-factory-next-fn33.47
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: the walkthrough sees the left menu whole
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: one setting, already diagnosed
repo: content-factory-next
branch: worktree-agent-a6c1bdd0574883665
base_branch: wave/fixes-2026-09-04
base_commit: 70fb3eaf20d77d8754fb5c4d12cee1e9082065ba
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c1bdd0574883665
write_zone:
  - apps/frontend/next.config.js
success_criteria:
  - the Next development indicator is drawn away from the left menu
selected_docs:
  - node_modules/next/dist/server/config-shared.d.ts (installed 16.2.6, read directly)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: development-only setting
verification:
  - "node --input-type=module -e \"import cfg from 'apps/frontend/next.config.js'\" (the config loads and reports position bottom-right)": passed
  - "pnpm exec prettier --check apps/frontend/next.config.js": passed
changed_files:
  - apps/frontend/next.config.js
explicit_defers:
  - none
---

# Summary

Формулировка bead неверна, и это записано в саму задачу: круглая кнопка в левом
нижнем углу — не помощник, а значок разработки Next 16.2.6. По умолчанию он
стоит в левом нижнем углу (`node_modules/next/dist/server/config-shared.d.ts`,
`devIndicators.position`), ровно там, где в левом меню «Выйти». В собранном
приложении этого значка нет, поэтому у реального человека «Выйти» ничем не
закрыт: продуктового дефекта нет.

Чтобы значок не мешал будущим прогонам, в `apps/frontend/next.config.js`
добавлена одна строка: `devIndicators: { position: 'bottom-right' }`.

# Scope / Routing

Один файл, одна настройка. Внешняя документация не понадобилась: имя и значения
ключа прочитаны в установленном пакете.

# Verification

Конфигурация загружена как модуль и вернула `{"position":"bottom-right"}`;
формат проверен prettier. Тестом это не закрывается — настройка живёт только в
режиме разработки.

# Delivery / Cleanup

Коммит `значок разработки Next не закрывает «Выйти»` на ветке потока.

# Risks / Follow-ups / Explicit Defers

Никаких. Bead стоит закрыть как «не дефект продукта», чтобы никто позже не
двигал настоящий элемент меню в поисках этой кнопки.
