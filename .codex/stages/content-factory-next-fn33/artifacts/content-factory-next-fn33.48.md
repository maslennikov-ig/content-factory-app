---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-o-assistant-refusal-devindicator
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: every signed-in page
public_facade: apps/frontend/src/components/copilot/copilot.provider.tsx
bounded_acceptance: no request to the assistant runtime from a page that cannot open the assistant
non_goals:
  - deferring the request until the popup itself is opened
  - removing the assistant
evidence:
  - none
task_id: content-factory-next-fn33.48
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: the assistant speaks only where it can be called
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: the consumer set had to be found before the provider could move
repo: content-factory-next
branch: worktree-agent-a6c1bdd0574883665
base_branch: wave/fixes-2026-09-04
base_commit: 70fb3eaf20d77d8754fb5c4d12cee1e9082065ba
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c1bdd0574883665
write_zone:
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/launches/helpers/pick.platform.component.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - apps/frontend/src/components/autopost/autopost.tsx
  - apps/frontend/src/components/plugs/plug.tsx
  - tests/copilot-provider.scope.test.cjs
success_criteria:
  - the app shell does not import CopilotKit
  - every consumer of the assistant either mounts the provider or is named an exception
selected_docs:
  - node_modules/@copilotkit/react-core/dist/index.js (installed 1.10.6, read directly)
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
risk_level: medium
risk_tags:
  - ui
  - api
affected_surfaces:
  - ui
  - api
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: no documented behaviour changed; the assistant is reachable where it always was
verification:
  - "pnpm exec jest tests/copilot-provider.scope.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs": passed
  - "pnpm exec jest tests/compose-channel-pick.test.cjs tests/editorial-stage.editor-wiring.test.cjs tests/autopost.generation.test.cjs tests/shared-form-control.contract.test.cjs tests/desert-lab-screen-review.test.cjs tests/hint.guard.test.cjs tests/content-intelligence.consumer-frontend.test.cjs tests/posts.save-refusal.test.cjs": passed
changed_files:
  - apps/frontend/src/components/copilot/copilot.provider.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/launches/helpers/pick.platform.component.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - apps/frontend/src/components/autopost/autopost.tsx
  - apps/frontend/src/components/plugs/plug.tsx
  - tests/copilot-provider.scope.test.cjs
explicit_defers:
  - the request still fires when the post composer opens; deferring it to the moment the popup is opened is composer work and needs its own bead
---

# Summary

Провайдер помощника больше не стоит вокруг всего приложения.

`@copilotkit/react-core@1.10.6` при монтировании безусловно шлёт запрос на
`runtimeUrl` — эффектом с пустым списком зависимостей, отключить его пропом
нельзя. Пока провайдер был в оболочке приложения, это был запрос (а у области с
настроенным поставщиком моделей — платный вызов) на каждой загрузке каждой
страницы. Диагноз потока J подтверждён; он лежит в истории этого же файла.

Провайдер вынесен в `components/copilot/copilot.provider.tsx` и монтируется
поимённо: окно редактора поста (вместе с крючками `editor.tsx`), подписи,
автопостинг, заглушки. Выбор каналов рисуется и на экранах вебхуков и каналов,
где помощника нельзя позвать вовсе, поэтому он провайдера не поднимает: его
подсказки вынесены в дочерний компонент и регистрируются только под уже
поднятым провайдером. Сам провайдер идемпотентен — вложенный уходит в сторону,
второго запроса нет.

Правка `manage.modal.tsx` намеренно тонкая (обёртка над переименованным телом
компонента), чтобы не переписывать шестьсот строк отступов в файле, который в
этой же волне правят другие потоки.

# Scope / Routing

Зона записи — оболочка приложения, потребители помощника по grep и тесты. Новый
файл `components/copilot/copilot.provider.tsx` — вынесенная наружу часть того же
кода, а не новая поверхность. Внешняя документация не понадобилась: поведение
версии 1.10.6 прочитано прямо в установленном пакете.

# Verification

Страж `tests/copilot-provider.scope.test.cjs` написан первым: до правки 7 из 7
проверок красные, после — зелёные. Дальше типы фронтенда и наборы дизайна,
локалей и затронутых экранов (список выше).

# Delivery / Cleanup

Коммит `помощник монтируется только там, где им пользуются` на ветке потока;
root сливает.

# Risks / Follow-ups / Explicit Defers

- Запрос `availableAgents` остался при открытии окна редактора поста и трёх
  экранов с полем-помощником. Это уже действие человека, но не «открыл окно
  помощника»; отложить до открытия попапа — отдельная задача.
- Английский текст отказа 503 не трогался: это тот же класс, что
  `content-factory-next-fn33.64`.
