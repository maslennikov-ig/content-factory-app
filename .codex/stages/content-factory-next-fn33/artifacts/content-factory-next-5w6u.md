---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-S
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: a rate ceiling of sixty requests a minute per workspace on the AI doors, refused as 429 with ai_rate_limited; the tenant-isolation ledger keyed by the calling method
bounded_acceptance: tests/tenant-isolation.guard.test.cjs, tests/ai-doors-throttle.test.cjs, tests/backend-locale-strings.test.cjs, tests/roles-matrix.guard.test.cjs
non_goals:
  - ключ реестра по номеру строки
  - предел на читающие двери помощника
  - личные пределы расхода на человека
evidence:
  - tenant-isolation-rekey-red-green
  - ai-doors-throttle-red-green
task_id: content-factory-next-5w6u
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: девятнадцать запросов пришлось прочитать по коду, плюс выбор потолка, который не мешает работе
repo: content-factory-next
branch: worktree-agent-ae080d20173abc0bb
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae080d20173abc0bb
write_zone:
  - tests/tenant-isolation.guard.test.cjs
  - tests/ai-doors-throttle.test.cjs
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - docs/product/roles-matrix.md
success_criteria:
  - реестр стража разведён по месту вызова, новое место под тем же ключом красное
  - у поиска подтверждений и у POST /copilot/* есть предел частоты
  - отказ несёт код и фразу из каталога бэкенда на языке ждущего
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-S
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: high
risk_tags:
  - tenancy
  - security
  - api
  - public-api
affected_surfaces:
  - backend
  - api
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — новый раздел про потолок частоты, прежнее «личных пределов нет» осталось верным
verification:
  - pnpm exec jest tests/tenant-isolation.guard.test.cjs: passed
  - pnpm exec jest tests/ai-doors-throttle.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs tests/backend-locale-strings.test.cjs tests/auth.registration-throttle.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - tests/tenant-isolation.guard.test.cjs
  - tests/ai-doors-throttle.test.cjs
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - docs/product/roles-matrix.md
explicit_defers:
  - POST /content-intelligence/sources/search-evidence — соседняя дверь с той же политикой Sections.AI, потолка не получила: задача называет только /sources/search, а сама она подтверждений не заказывает, а принимает уже найденное
---

# Summary

Две половины, обе про «зелёный, который ничего не значит».

**Реестр стража разведён по месту вызова.** Ключ был «файл + модель + операция», поэтому пять `post.update` в одном репозитории делили одну строку и одно объяснение, а шестой унаследовал бы его молча. Ключ теперь называет метод. Номер строки был бы точнее и дрожал бы от любой правки выше — реестр превратился бы в шум, который переписывают не читая; имя метода живёт ровно столько, сколько метод значит то же самое, а переименование делает запись устаревшей, то есть просьбой прочитать заново.

Двадцать четыре строки стали сорока. **Девятнадцать появившихся не читал никто** — они всё это время стояли за чужим объяснением. Прочитаны все девятнадцать по коду и вызовам; все девятнадцать законны, каждая записана со своей причиной и датой. **Два старых объяснения оказались написаны про другой вызов:** `oAuthApp.findFirst` был оправдан фразой «помеченный случай как раз фильтрует» — это правда про соседа и никогда не было правдой про `getAppByClientId`, который не фильтрует и не должен (client_id — имя приложения в самом протоколе OAuth, по нему сервер и узнаёт, чьё оно).

Что осталось от слабости: два вызова одной модели и операции внутри одного метода по-прежнему делят строку. Таких пар три, они названы в `COLLAPSED` со счётчиком, и **третий вызов внутри такого метода теперь красный**, а не унаследует объяснение соседей.

**Потолок частоты на дверях, которые тратят модель.** У `POST /content-intelligence/sources/search` и всех `POST /copilot/*` не было предела никакого. Учёт был — `AiUsageService` пишет строку на каждый вызов — но учёт говорит, сколько потрачено, уже после того, как счёт выставлен. Допуск тарифа (`ni7x`) отвечает «сколько за месяц» и ничего не говорит о скорости: цикл по `/copilot/agent` вычерпывает месяц за час, и первым это заметит счёт.

Механизм нашёлся готовый: `ThrottlerBehindProxyGuard`, глобальный `APP_GUARD`, который уже ведёт четыре пути входа и `POST /public/v1/posts`. Добавлены пути, а не второй механизм. **Шестьдесят в минуту на пространство, отдельно на каждую дверь** — потолок на сорвавшийся скрипт, не квота: человек, который пишет с помощником, до него не доходит, и десять человек в одном пространстве тоже. Нарочно свободный, потому что предел, мешающий обычной работе, снимут через неделю, и предела снова не будет. Читающие двери (`GET /copilot/credits`, `GET /copilot/list`) не считаются: их опрашивает экран, и душить опрос — сломать страницу, ничего не защитив.

Отказ — 429 с кодом `ai_rate_limited` и фразой из каталога бэкенда на языке ждущего, во всех шестнадцати локалях. `super` ответил бы «ThrottlerException: Too Many Requests», что пишущему человеку не говорит ничего.

# Scope / Routing

Формулировка задачи говорит «в режиме публичного ключа организации». **В этом дереве обе двери сидят за `AuthMiddleware` (сеансовый JWT) и ключом организации недостижимы** — ключ ведёт только на `/public/v1/*` через `PublicAuthMiddleware`. Потолок поэтому считается по пространству запроса, каким бы способом оно ни пришло; если эти двери когда-нибудь откроют ключу, предел уже будет на месте.

# Verification

Красный до правки, обе половины: реестр показывал два новых запроса и девятнадцать несовпадений по ключу; восемь случаев из десяти в наборе потолка проходили там, где должны отказывать (`Received promise resolved instead of rejected`). Провайдер для этой проверки временно откатывался к `HEAD` и возвращался обратно.

# Delivery / Cleanup

Возвращено корню; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

- **Допущение, которое стоит подтвердить владельцу:** шестьдесят запросов в минуту на пространство на каждую дверь. Взято консервативно — так, чтобы обычная работа не встретила потолок; если наблюдение покажет иначе, число живёт в одном месте.
- `POST /content-intelligence/sources/search-evidence` потолка не получил: см. `explicit_defers`.
- Ключ хранилища `@nestjs/throttler` включает имя обработчика, поэтому у каждой двери своё ведро. Скрипт, идущий по четырём дверям сразу, упирается в 240 в минуту, а не в 60. Ограничено, но стоит знать.
- Два бывших «key collapse» объяснения были неверны. Стоит считать это указанием: остальные причины писались в тех же условиях, и `COLLAPSED` теперь единственное место, где схлопывание вообще допускается.
