---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D2
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: owner-decision-on-or3.9
public_facade: docs/product/tariff-levers.md
bounded_acceptance: docs link checks and process verification pass; no code changed
non_goals:
  - решать тарифы, цены или триал — это остаётся за владельцем (or3.9)
  - менять код, схему или поведение продукта
  - чинить найденные расхождения (автопост под WEBHOOKS, ULTIMATE против PRO)
evidence:
  - docs-link-check
  - process-verification
task_id: content-factory-next-uvh8
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-owner-decisions-2026-09-05
milestone: карта тарифных рычагов перед решением or3.9
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: обход кода по многим подсистемам и сведение в один документ
repo: content-factory-next
branch: worktree-agent-a5b17d93daf05e5a1
base_branch: wave/owner-decisions-2026-09-05
base_commit: 686d7f4b646b0ecf7f97e3458ef49499d6834871
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a5b17d93daf05e5a1
write_zone:
  - docs/product/tariff-levers.md
  - docs/README.md
  - docs/product/roles-matrix.md
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-uvh8.md
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
success_criteria:
  - один документ по-русски со всеми рычагами, где каждый назван словами, местом в коде, значением и режимом
  - предел подписок на идеи (20) помечен как входящий в тариф
  - открытые вопросы владельцу — по одной строке на решение
  - ссылка на документ из списка продуктовых документов и из матрицы ролей
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-owner-decisions-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: только документы, временных файлов нет
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: новый docs/product/tariff-levers.md, ссылка в docs/README.md и docs/product/roles-matrix.md
verification:
  - python3 -m unittest tests/test_docs_links.py: passed
  - python3 scripts/docs/check_docs.py: passed
  - bash scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - docs/product/tariff-levers.md
  - docs/README.md
  - docs/product/roles-matrix.md
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-uvh8.md
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
explicit_defers:
  - content-factory-next-or3.9 — сами тарифы и триал; документ только собирает, на что они повлияют
  - content-factory-next-fn33.9 — возврат тарифных условий во вкладки настроек, делать после or3.9
  - content-factory-next-fn33.103 — кого щадить при обрыве подписки, решать вместе с or3.9
---

# Summary

`docs/product/tariff-levers.md` — 31 рычаг в трёх таблицах и 13 открытых
вопросов владельцу. Каждая строка проверена по коду, не по памяти. Кода не
менял.

Главная находка, ради которой документ и нужен: тарифных пределов на боевом
инстансе сегодня не существует вовсе. `permissions.service.ts` читает тарифную
таблицу только при заданном `STRIPE_PUBLISHABLE_KEY`, а в
`deploy/production/app.env.example` переменных `STRIPE_*` нет; без них цикл
проверки разрешает каждый раздел, кроме `Sections.ADMIN`. Значит 13 пределов
упстрима (каналы, посты, участники, вебхуки, ИИ, картинки, видео, импорт) в день
включения оплаты оживут сами, без правки кода, и сразу числами Postiz — 5
каналов за 29 долларов и так далее. Это не «включить оплату», это «принять
чужую экономику молча».

Три расхождения, найденные по дороге и вынесенные в вопросы, а не исправленные:

- `/user/self` без оплаты отдаёт тариф `ULTIMATE`, а `permissions.service.ts`
  берёт `PRO` — два разных ответа на один вопрос;
- автопост продаётся флагом `pricing.autoPost`, а дверь `POST /autopost/v2`
  стоит под `Sections.WEBHOOKS`, то есть считает вебхуки;
- `public_api`, `community_features`, `featured_plan` — флаги и разделы есть, ни
  одной двери, которая бы их читала, нет.

Предел подписок на идеи (`MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION = 20`) помечен
в таблице «плоский, **входит в тариф**», как просил владелец.

# Scope / Routing

Зона записи соблюдена: новый документ, по одной строке-ссылке в `docs/README.md`
(там живёт существующий список продуктовых документов — в `product-scope.md`
списка нет) и в `docs/product/roles-matrix.md` рядом с фразой «тариф не
подменяет роль», артефакт и запись в манифесте.

Внешняя документация не понадобилась: вся работа — чтение своего репозитория.

Обойдённые места: `pricing.ts`, `permissions.service.ts`,
`permission.exception.class.ts`, `subscription.exception.ts`,
`subscription.service.ts`, `organization.repository.ts`, `ai.usage.service.ts`,
`ai.provider.config.ts`, `lead-limits.ts`, `lead-feed.gateway.ts`,
`throttler.provider.ts`, `upload.limits.ts`, `media.service.ts`,
`users.controller.ts`, `settings.component.tsx`, `top.menu.tsx`, коммит
`6317e656`, `deploy/production/app.env.example`.

# Verification

- `python3 -m unittest tests/test_docs_links.py` — 3 теста, OK.
- `python3 scripts/docs/check_docs.py` — `Documentation links OK (126 files checked)`.
- `bash scripts/orchestration/run_process_verification.sh` — `process verification OK`;
  изоляция worktree запуску не помешала.

Красного, что было бы красным до меня, не встретил.

# Delivery / Cleanup

Возвращено на ветке `worktree-agent-a5b17d93daf05e5a1` одним коммитом. Слияние
за root. Временных файлов не оставлено.

# Risks / Follow-ups / Explicit Defers

Риск один и он у документа, а не у кода: карта верна на 05.09.2026 и разойдётся
с кодом при следующей правке любого из 31 места. Смягчено строкой «если документ
разошёлся с кодом, верен код» и точными именами констант — расхождение будет
видно грепом. Стража, который держал бы карту правдой, нет, и заводить его
раньше решения `or3.9` смысла нет: пока оплаты нет, половина строк описывает
неработающий механизм.

Допущение, принятое консервативно в отсутствие владельца: ничего из найденного
не исправлял, включая три расхождения выше — задача сказала «кода не менять», и
каждое из них упирается в решение по `or3.9`.

Ни один открытый вопрос я не закрыл собственным решением: все 13 вынесены
наверх документа списком, каждый одной строкой.
