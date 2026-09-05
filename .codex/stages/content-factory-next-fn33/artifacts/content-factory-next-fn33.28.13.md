---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: блок «Использованные цитаты» в окне поста
public_facade: n/a
bounded_acceptance: jest-compose-citations-language
non_goals:
  - состав и порядок самих цитат
evidence:
  - jest-compose-citations-language
task_id: content-factory-next-fn33.28.13
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: человеческие подписи окна поста
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: две подписи и три ключа на шестнадцать локалей
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/new-launch/editor.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - «Fact» и «Source» переведены и берутся из локалей
  - пояснение написано словами человека, а не устройства
  - подписи есть во всех шестнадцати локалях
selected_docs:
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
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
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: изменились подписи, не поведение
verification:
  - "pnpm exec jest jest-compose-citations-language": passed
  - "pnpm exec jest jest-locale-key-set jest-locale-translated": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/new-launch/editor.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - jest-compose-citations-language
explicit_defers:
  - none
---

# Summary

Две поломки в одном блоке, обе про язык.

**Слово вида цитаты.** `${citation.kind === 'FACT' ? 'Fact' : 'Source'} · …`
было зашито прямо в разметке, поэтому на русском экране строка начиналась
английским словом — «Source · Занятость в регионе выросла на 4%», — хотя
заголовок и пояснение того же блока переводились. Теперь это два ключа,
`citation_kind_fact` и `citation_kind_source`, во всех шестнадцати локалях.

**Пояснение.** «Выберите факты и доказательства, выданные сервером и
использованные в этом элементе» — «выданные сервером» рассказывает, откуда
взялась запись, а не что человеку сделать; «элемент» — тоже слово из
устройства. Стало: «Отметьте, на какие факты и источники опирается этот текст».
Указание к действию осталось, язык устройства ушёл.

# Scope / Routing

Зона записи соблюдена; вне её только локали и тесты. Переведены все шестнадцать
локалей, как в `fn33.28.8` и `fn33.28.9`; allowlist не тронут, проверка письма
зелёная. `ka_ge` и `bn` носитель не читал.

# Verification

Красное до правки: 5 падений из 5 в
`tests/compose-citations.language.test.cjs`. После правки 5/5.

Набор держит четыре вещи, и последняя — не «убрали слово», а «строка осталась
указанием к действию»: иначе починку языка можно было бы «пройти», удалив
пояснение целиком. Отдельно проверено, что прежняя склейка ушла из разметки
насовсем, а не осталась запасной веткой.

`locale-key-set` и `locale-translated` зелёные, `tsc --noEmit` по фронтенду —
ноль.

# Risks / Follow-ups / Explicit Defers

- Заголовок блока остался «Использованные цитаты». Слово «цитаты» рядом с
  «фактами и источниками» в пояснении — не одно и то же понятие; bead этого не
  называл, и трогать заголовок без повода я не стал. Если владелец захочет
  одного слова на весь блок, это отдельное решение о словаре раздела.
- Тексты `ka_ge` и `bn` не читал носитель языка.
