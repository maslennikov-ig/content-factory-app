---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/content-intelligence.facts-door.test.cjs, tests/brand-voice.brief-tab.test.cjs, tsc frontend
non_goals:
  - морфология, лемматизация, словари форм
  - переименование ключей у фактов, сохранённых раньше
evidence:
  - none
task_id: content-factory-next-fn33.112
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка в одной чистой функции, цена ошибки — названия тем у всех новых фактов
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - apps/frontend/src/components/content-intelligence/content-facts.adapter.ts
  - tests/content-intelligence.facts-door.test.cjs
success_criteria:
  - ключ не начинается со служебного слова, темы «В», «Наши» больше не появляются
  - утверждение из одних служебных слов получает устойчивый ключ, а не пустой
  - все ключи проходят CLAIM_KEY_PATTERN
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-r
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
  - data
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: карта раздела говорит, что ключ заполняется сам, и это не меняется
verification:
  - pnpm exec jest tests/content-intelligence.facts-door.test.cjs: passed
  - pnpm exec jest tests/brand-voice.brief-tab.test.cjs tests/content-intelligence: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-facts.adapter.ts
  - tests/content-intelligence.facts-door.test.cjs
explicit_defers:
  - ключи у фактов, уже сохранённых с прежним правилом, остаются как есть: переименование задним числом — отдельное решение владельца
---

# Summary

Ключ факта больше не собирается из первых слов подряд. Служебные слова (предлоги, союзы, частицы, местоимения, связки), однобуквенные слова и голые числа пропускаются по короткому русско-английскому списку; из оставшихся берутся первые два-три. «В нашей редакции с 1 сентября…» даёт `редакции|сентября_число` вместо `в|нашей_редакции_с`, «Наши авторы сдают список ссылок…» — `авторы|сдают_список`. Голое число выброшено намеренно: «период_14» и «период_30» — это один атрибут, разложенный по двум ключам.

Утверждение, в котором значимых слов не осталось, получает ключ `утверждение|<шесть шестнадцатеричных знаков от самого текста>`: такие факты лежат вместе под одной темой, а не выдумывают тему каждый себе. Утверждение вовсе без букв и цифр по-прежнему даёт пустую строку — сохранять там всё равно нечего.

# Scope / Routing

Один файл `content-facts.adapter.ts` и его набор. Список служебных слов сознательно тупой: ни лемматизации, ни статистики, чтобы один и тот же текст всегда давал один и тот же ключ.

# Verification

Красный до правки: ожидали `редакции|сентября_число`, получали `в|нашей_редакции_с`; ожидали ключ вида `утверждение|xxxxxx`, получали `и|вот_это_всё`.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Отклонение от «Сделать:»: в задаче запасной ключ записан как «утверждение-<короткий хеш>», но ключ обязан иметь вид «тема|атрибут» (CLAIM_KEY_PATTERN и DTO), поэтому он собран как `утверждение|<хеш>` — тема «утверждение», атрибут — отпечаток текста. Владельцу подтвердить, что такое название темы в радаре его устраивает.
