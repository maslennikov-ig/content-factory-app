# Дизайн-основание стадии vme.2

Локатор задачи: `content-factory-next-vme.2.design-research`

selected_agent: root-orchestrator
selected_model: inherit_orchestrator
selected_reasoning_effort: inherit_orchestrator
selection_rationale: обязательная продуктовая UI-маршрутизация перед декомпозицией потоков

## Источник

Приватный Agentic Search:
https://www.lazyweb.com/agentic-search/fe665ce8-13eb-4b56-9c82-ed1d222fdc2b

Выбраны Stripe Dashboard, Databricks, Hashnode, Polar и Clerk. Их роль — не
задавать новую визуальную систему, а подтвердить четыре продуктовых решения:
группировка настроек, явная граница оплаты, честный empty/unavailable analytics
и компактная developer-иерархия. Реализация остаётся на `cf-*` и существующих
примитивах Content Factory.

## Границы

- Никакие внешние бренды, тексты, тарифы или protocol contracts не копируются.
- Growth Report не запускался: пользователь его не запрашивал.
- Исследование не выполняло внешних записей, покупок или живых подключений.
