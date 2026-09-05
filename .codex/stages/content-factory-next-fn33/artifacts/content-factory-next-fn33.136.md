---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-F
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/owner-decisions-2026-09-05
public_facade: n/a
bounded_acceptance: tests/content-search.panel-refusals.test.cjs
non_goals:
  - смягчение сетевой политики источников (только https, порт 443)
  - подмена http на https за человека
  - склейка одинаковых адресов по http и https в одну строку
evidence:
  - content-search-panel-refusals-suite
task_id: content-factory-next-fn33.136
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «решения владельца 05.09.2026»
milestone: волна «решения владельца 05.09.2026»
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: выбор между смягчением политики и честным отказом решался чтением спецификации источников
repo: content-factory-next
branch: worktree-agent-ae5ffe34086c2c650
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813cc
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae5ffe34086c2c650
write_zone:
  - apps/frontend/src/components/content-intelligence/content-search.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/
success_criteria:
  - строка по http не предлагает «Взять как доказательство»
  - на её месте стоит причина, а не общий сбой
  - строка остаётся на экране, ссылку можно прочитать
selected_docs:
  - docs/product/content-source-registry-spec.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-F
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: политика источников не менялась, экран стал ей соответствовать
verification:
  - "pnpm exec jest tests/content-search.panel-refusals.test.cjs": passed
  - "pnpm exec jest tests/content-search-screen.guard.test.cjs": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-search.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/content-search.panel-refusals.test.cjs
explicit_defers:
  - none
---

# Summary

Сервер отвергал http правильно: `canonicalizeSourceUrl` принимает только https
на порту 443, и это принятая сетевая политика источников
(`content-source-registry-spec.md`), а не недосмотр. Неправ был экран — он
предлагал нажать то, что продукт уже решил не принимать, и объяснял отказ общей
фразой «попробуйте ещё раз», от которой ничего не менялось.

Поэтому то же правило читается теперь до отрисовки кнопки: `takeRefusal(url)` в
адаптере повторяет проверку сервера (протокол, порт, учётные данные в адресе).
Строка с http остаётся на экране — ссылку всё ещё полезно открыть, — но вместо
кнопки стоит причина: доказательство хранится только по https, ту же страницу
стоит поискать по https. Сервер продолжает отказывать; экран просто перестал
предлагать заведомый отказ.

На случай, если отказ всё-таки придёт (адрес нормальный на вид, а сервер его не
принял), панель теперь называет `UNSUPPORTED_PROTOCOL` тем же человеческим
текстом, а не общим «не удалось».

# Scope / Routing

Зона записи соблюдена: только панель поиска и её адаптер. Политика источников,
`network-policy.ts` и DTO принятия не тронуты.

# Verification

См. поле `verification`. Проверки панели до правки были красными.

# Delivery / Cleanup

Возвращено корню волны; ветка потока остаётся до слияния.

# Risks / Follow-ups / Explicit Defers

- Дубли не склеиваются: если поисковик вернул один и тот же материал по http и
  по https, это две строки, одна с кнопкой, вторая с причиной. Склейка — про
  выдачу, а не про отказ, и в этой bead её не просили.
- Правило продублировано на клиенте. Расхождение поймает тест адаптера, но
  единственным источником правды остаётся сервер.
