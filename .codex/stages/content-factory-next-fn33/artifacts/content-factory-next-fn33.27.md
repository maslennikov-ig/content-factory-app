---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-F
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост» (apps/frontend/src/components/new-launch)
public_facade: n/a
bounded_acceptance: круг канала выбирается под ролью USER; запрет на планирование называет причину словами
non_goals:
  - не менять подпись кнопки `check_circles_above` (её ведёт поток fn33.28)
  - не открывать закрытую дверь «пост с проверенным контекстом — только черновик»
evidence:
  - none
task_id: content-factory-next-fn33.27
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений живого прогона 04.09.2026
milestone: окно поста под ролью участника
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: расследование с воспроизведением на стенде и сравнением ответов API
repo: content-factory-next
branch: worktree-agent-a56e7a0a0304b21a3
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a56e7a0a0304b21a3
write_zone:
  - apps/frontend/src/components/new-launch/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/compose-channel-pick.test.cjs
success_criteria:
  - причина названа и доказана, а не угадана
  - тест падает без исправления и проходит с ним
selected_docs:
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: в dev-базе остались фикстуры участника (User u-fn3327-member, Organization org-fn3327-personal)
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
docs_review_notes: роль здесь дверью не управляет, новой строки в матрице ролей не появилось
verification:
  - pnpm exec jest tests/compose-channel-pick.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/design.typography.test.cjs: passed
  - pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs tests/brand-voice.ribbon-live.test.cjs tests/editorial-stage.editor-wiring.test.cjs tests/backend-locale-strings.test.cjs tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/compose-block-reason.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/compose-channel-pick.test.cjs
explicit_defers:
  - content-factory-next-fn33.28 — переработка окна целиком, включая подпись «Проверьте круги выше»
---

# Summary

Роль тут ни при чём. `GET /integrations/list` под SUPERADMIN и под участником с
ролью USER в той же области отдаёт побайтово один ответ, `getIntegrationsList`
фильтрует только по организации, а ни картинка каналов, ни стор окна поста не
читают роль вовсе. На стенде под живым участником с ролью USER круг выбирается:
`aria-pressed` становится `true`, в ряду появляется аватар канала, подпись
кнопки меняется на «Добавить в календарь».

Мёртвой была кнопка, а не круг. Как только у поста появляется проверенный
контекст (человек нажал «Исследовать текущий черновик»), `manage.modal`
выключает «Добавить в календарь» и «Опубликовать сейчас» навсегда — условие
`!!contentIntelligenceProvenance`. Это решение продукта: пост с проверенным
контекстом уходит только в черновик, и панель контекста прямо так и пишет. Но
единственная подпись рядом продолжала звать к кругам, а щелчок по кругу ничего
не открывал. Человек читает это как «круг не выбирается».

Дверь оставлена закрытой. Добавлена строка, которая называет причину.

# Scope / Routing

Зона записи соблюдена. Подпись `check_circles_above` не тронута — её ведёт
fn33.28. Новый ключ добавлен во все 16 локалей рядом с родственными
`content_context_*`.

# Verification

Все команды выше выполнены в этом worktree под Node 22.23.2. Красный до
исправления: `tests/compose-channel-pick.test.cjs` — 2 из 6 проверок падали.

# Delivery / Cleanup

Возвращено корню. В dev-базе (порт 5433, не боевая) остались фикстуры:
`User u-fn3327-member`, `UserOrganization uo-fn3327-member` (роль USER в области
AiDev) и `Organization org-fn3327-personal`. Удалять или оставить — решает корень.

# Risks / Follow-ups / Explicit Defers

- Вопрос владельцу: правило «пост с проверенным контекстом можно только
  сохранить как черновик» — так и задумано? Если да, кнопку планирования у
  такого поста стоит не выключать молча, а убирать или подписывать иначе; это
  работа fn33.28.
- `getOrgsByUserId` (organization.repository.ts:217) читает организации без
  `orderBy`, а middleware берёт `organization[0]`, когда нет cookie `showorg`.
  У человека с двумя областями это лотерея. К этой ошибке отношения не имеет,
  на стенде не выстрелило — но это отдельная задача.
