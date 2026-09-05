---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-P
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: owner-decision-on-platform-mark-display
public_facade: docs/design/desert-lab/platform-mark-display-rules.md — единственная дверь к условиям показа знаков платформ
bounded_acceptance: docs-only research; no interface, code or asset change
non_goals:
  - изменять размеры знаков, добавлять ссылки, менять компоненты
  - заявлять соответствие правилам показа товарных знаков
  - выносить юридическое суждение вместо владельца
evidence:
  - primary-brand-pages-2026-09-05
  - process-verification
task_id: content-factory-next-4s0l
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: условия показа знаков платформ проверены и сведены в один список владельцу
milestone_status: accepted
agent_type: docs_researcher
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: широкий обход первичных источников с точной выпиской чисел и запретов
repo: content-factory-next
branch: worktree-agent-a1e60647c1348a65c
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a1e60647c1348a65c
write_zone:
  - docs/design/desert-lab/platform-mark-display-rules.md
  - docs/design/desert-lab/platform-card.md (одна строка-ссылка)
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-4s0l.md
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
success_criteria:
  - по каждому из 34 знаков записан первичный источник, дата обращения и найденные требования
  - непроверенное помечено как «не проверено», ничего не додумано
  - вверху один список расхождений для владельца
selected_docs:
  - docs/design/desert-lab/platform-card.md
  - docs/design/desert-lab/youtube-mark-inventory.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка остаётся для слияния корневым сеансом
risk_level: medium
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: добавлен platform-mark-display-rules.md, из platform-card.md на него ссылка одной строкой
verification:
  - pnpm exec jest tests/platform.card.test.cjs tests/youtube-mark-inventory.test.cjs: passed
  - bash scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - docs/design/desert-lab/platform-mark-display-rules.md
  - docs/design/desert-lab/platform-card.md
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-4s0l.md
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
explicit_defers:
  - x, reddit, vk, medium, kick, slack — первичные страницы недоступны из этой среды (402/403/блок домена/нечитаемый PDF); повторить из среды с обычным браузером
  - решение по восьми расхождениям принимает владелец, как это было сделано по YouTube 31.08.2026
---

# Summary

Проверены условия ПОКАЗА знаков платформ по первичным страницам брендинга самих
платформ, обращение 05.09.2026. Знаков в карточке 35; YouTube решён раньше,
разобраны оставшиеся 34. Первичный источник с проверяемыми условиями найден у 28
из 34; у 6 страница из этой среды не открылась и в таблице стоит «не проверено».

Результат — `docs/design/desert-lab/platform-mark-display-rules.md`: таблица по
знакам (источник, числовые требования, требование ссылки, запреты, разрешение на
наш случай) и вверху **один список из восьми пунктов** для владельца, где наши
размеры из инвентаризации ниже требуемых или условие показа нарушено явно:
Facebook 16px против наших 12px; Instagram 29×29px против 24/16/12; чистое поле
Meta 1/4 ширины против наших 1/12; Mastodon 36px чистого поля; Bluesky чистое
поле в размер логотипа; Pinterest требует ссылку на аккаунт; TikTok запрещает
знак без письменного разрешения; Reddit/X/VK не проверены.

Интерфейс не менялся: размеры, ссылки и носители знака те же.

# Scope / Routing

Зона записи соблюдена. Кода не тронуто. Только первичные домены платформ и
тексты лицензий; блоги и агрегаторы в источники не попали. Два числа (Medium
20px, X 29×29px) найдены только в пересказах и потому вынесены отдельной
оговоркой, а не в список владельцу.

Допущение, принятое по правилу «самое консервативное» (владелец уехал): там, где
первичная страница недоступна, записано «не проверено», а не «требований нет».

# Verification

- `pnpm exec jest tests/platform.card.test.cjs tests/youtube-mark-inventory.test.cjs` — прошли.
- `bash scripts/orchestration/run_process_verification.sh` — прошёл.

Наборов, читающих `docs/design/desert-lab/`, всего один относящийся к теме —
`tests/youtube-mark-inventory.test.cjs`; он читает `youtube-mark-inventory.md`,
который не менялся.

# Delivery / Cleanup

Возвращено корневому сеансу для слияния. Конфликтов не ожидается: новый файл
плюс одна вставленная строка в `platform-card.md` между разделом про YouTube и
разделом «Чего в продукте нет».

# Risks / Follow-ups / Explicit Defers

- Шесть источников остались непроверенными; это записано в документе построчно.
- Восемь расхождений ждут одного решения владельца. Ни один документ продукта
  по-прежнему не должен заявлять соответствие правилам показа.
- Ни один вывод здесь не является юридическим суждением.
