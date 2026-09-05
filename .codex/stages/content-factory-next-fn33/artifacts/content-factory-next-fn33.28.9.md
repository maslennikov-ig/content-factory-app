---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: строка остатка квоты у платных кнопок раздела «Контент»
public_facade: GET /settings/ai/allowance
bounded_acceptance: jest-ai-allowance-hint + jest-ai-allowance-read
non_goals:
  - счётчики и период — арифметика не менялась
  - экран настроек AI у администратора
evidence:
  - jest-ai-allowance-hint
  - jest-ai-allowance-read
task_id: content-factory-next-fn33.28.9
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: честные состояния квоты
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: различение трёх состояний, которые раньше сливались в одно
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - apps/frontend/src/components/ui/allowance-hint.tsx
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - свежее пространство без тарифа и без ключа не читает «исчерпано»
  - сказано, чего именно нет и куда идти
  - потраченный лимит по-прежнему называется исчерпанным
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
  - api
  - user-flow
affected_surfaces:
  - api
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: дверь и её доступность уже описаны в roles-matrix; состав ответа расширен без изменения прав
verification:
  - "pnpm exec jest jest-ai-allowance-hint": passed
  - "pnpm exec jest jest-ai-allowance-read": passed
  - "pnpm exec jest jest-ai-allowance-parity jest-ai-allowance-door": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - apps/frontend/src/components/ui/allowance-hint.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - jest-ai-allowance-hint
  - jest-ai-allowance-read
  - jest-ai-allowance-parity
explicit_defers:
  - none
---

# Summary

Одна строка говорила две разные вещи, и обе называла исчерпанием.

`readAllowance` во фронтенде считал исчерпанием и `remaining <= 0`, и
`limit <= 0`. Свежее пространство, где никто ничего не нажимал, получало «Лимит
включённого AI исчерпан». Исчерпание — это про потраченное; когда тратить было
нечего, человеку надо сказать, чего нет и куда идти.

Разделено на три честных состояния вместо одного:

- **`unavailable`** — нечем позвать модель вовсе: ни включённого лимита, ни
  ключа. Считает это дверь: `config.apiKey` пуст ровно тогда, когда у
  выбранного режима нет ключа — у `workspace_key` его не задал администратор, у
  `included` его нет у оператора. Это то же условие, по которому платные двери
  отвечают 503. Счётчиков в ответе нет, потому что считать нечего, и в книгу
  учёта дверь при этом не ходит вовсе.
- **`no_allowance`** — ключ есть, а включённого лимита пространству не выдали.
  Тратить будет можно, когда появится тариф.
- **`exhausted`** — прежнее значение, теперь только при `limit > 0`.

Оба новых состояния сказаны приглушённым цветом, а не красным: человеку ничего
не запретили, ему сообщают положение дел. Красный остался за исчерпанием, и
слова у него прежние — те же, что у отказа 429, чтобы одна причина не звучала
двумя фразами.

Ключа наружу по-прежнему не уезжает: наружу уезжает одно слово о том, что
позвать модель нечем.

# Scope / Routing

Зона записи соблюдена; вне её только локали и тесты. Два новых ключа переведены
во все шестнадцать локалей (тот же порядок, что и в `fn33.28.8`); allowlist не
тронут, проверка письма зелёная. `ka_ge` и `bn` носитель не читал.

# Verification

Красное до правки: `ai-allowance.hint` и `ai-allowance.read` вместе — 5 падений
из 19. После правки 19/19.

Попутно починена собственная нестабильность в `ai-allowance.parity.test.cjs`
(мой набор из `fn33.28.6`): предикат несёт окно активного допуска
`Date.now() - сутки`, и два чтения, разошедшиеся на миллисекунду, давали разные
даты. Часы остановлены на время набора.

`tsc --noEmit` по обоим приложениям — ноль.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не сливалась и не выкладывалась.

# Risks / Follow-ups / Explicit Defers

- `AiAllowanceView` получил третий вариант. Любой будущий читатель двери должен
  его знать; сегодня читателей два — эта строка и проводка помощника
  (`fn33.28.11`), оба обновлены.
- Слова «Настройки → AI» ведут человека на экран, который открыт только
  администратору. Участник прочтёт, куда идти, но сам туда не попадёт — это
  верно по смыслу (настроить может только администратор), но стоит подтвердить
  владельцу, что участнику показывают именно этот адрес.
