# Stage Summary: search-provider review remediation

## Goal

Исправить блокер и замечания P2/P3 независимого ревью ветки
`codex/search-provider-openrouter`, не меняя выбранную архитектуру: Tavily
остаётся основным поиском, а OpenRouter — только запасным платным путём после
явного допустимого отказа.

## Observable behavior

- Starter prompt снова содержит дословную строку `Use $orchestrator-stage`.
- Название источника больше не содержит имя провайдера; provenance остаётся в
  структурном поле `provider`.
- Платный fallback опирается только на явные `status`/`code`. Неизвестная
  текстовая ошибка не запускает OpenRouter, а двойной отказ сохраняет обе
  исходные ошибки.
- Фабрика клиента и сам запрос входят в дедлайн своего пути. OpenRouter
  использует разрешённый для организации `config.baseUrl`.
- Сохранённый `searchDepth=basic` доходит до Tavily и не перезаписывается при
  частичном сохранении. Для новой записи применяется `advanced`; контрол снова
  отображается в настройках, а Save заблокирован до загрузки данных.
- API принимает только `searchProvider=tavily`.
- Длинный первый абзац режется по символу, граница абзаца в позиции `0`
  учитывается, а потолок `32 000` документирован как потолок текста фактов, не
  всего форматированного результата.
- Компонентный тест рендерит настоящий JSX и проверяет сохранённый `basic`,
  backend-состояние fallback и состояние загрузки.

## Review

Независимый read-only review потока `paid_fallback_review` после последних
исправлений не нашёл дефектов production-логики или расходного поведения.
Единственным оставшимся замечанием было обновить полный набор приёмки и
дословные выводы в реализационном отчёте; это входит в финальный closeout.

## Verification

- Targeted red/green: 4 поисковых набора, 54/54 теста после финального
  исправления гонки загрузки.
- Каноническая root-owned release-level приёмка:
  `run_stage_closeout.py --stage content-factory-next-2jm --level release
  --must-run-reason source_changed` — exit 0.
- `pnpm run build` собрал frontend, backend и orchestrator; `pnpm test` прошёл
  31 Jest suite / 206 тестов и 4 Python-теста; brand-scan — 0 необъяснённых из
  2202 allowlisted; docs-check — 52 файла; process verification и
  `git diff --check` зелёные.
- Реальные поисковые и модельные вызовы запрещены и не выполнялись.

## Explicit deferrals and non-goals

- Новая метка провайдера в UI не добавлялась: это отдельная задача владельца.
- Ключи глубины локалей не удалены, потому что восстановленный контрол снова их
  использует; удалён только действительно мёртвый `search_provider`.
- Вместо включения summary/title/URL в лимит `32 000` его описание исправлено
  на фактический лимит текста фактов, как разрешено ревью.
- Реальные вызовы Tavily/OpenRouter, pilot, ключи, миграция production-БД,
  commit, push, merge и deploy вне границы этапа.
- Четыре посторонних untracked PNG сохранены без изменений.

## Documentation and graph review

`project-index: reviewed-no-change` — стабильные точки входа и навигация не
изменились; правки уточняют поведение уже описанного search-provider slice.

`docs-reviewed: updated - handoff, implementation report and both provider prompts now describe clean titles, explicit failure fields, saved depth, real deadline coverage and the fact-text-only 32k ceiling.`

`graph-reviewed: updated - после принятой release-level границы локальный ignored-граф перестроен из рабочего дерева: 6660 nodes, 15895 edges, 522 communities, 0 model tokens; external/API extraction и Git hooks не использовались.`

## Boundary

Работа остаётся только в рабочем дереве ветки
`codex/search-provider-openrouter`. Ничего не слито в `main`, не запушено и не
развёрнуто.

Статус этапа: accepted. Beads-задача закрыта после независимого read-only review
и канонической приёмки.
