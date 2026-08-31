# Search Provider Review Fixes Implementation Plan

**Goal:** устранить все перечисленные замечания ревью ветки `codex/search-provider-openrouter`, сохранив Tavily основным поиском и OpenRouter только платным запасным путём по явному отказу.

**Approach:** один root-owned интеграционный срез исправляет клиентские адаптеры, нормализацию результата, форму настроек, валидацию и доказательства. Для наблюдаемого поведения сначала добавляются точечные регрессионные тесты; единая итоговая приёмка запускается после зелёного focused-набора.

**Non-goals:** новый визуальный дизайн или метка провайдера в интерфейсе, реальные Tavily/OpenRouter вызовы, pilot, merge, push и deploy.

## Scope ledger

- Блокер handoff/process verification -> Task 1.
- P2: title, явные status/code, `searchDepth`, строгий `searchProvider`, безопасная обрезка -> Task 1.
- P3: живой бюджет времени, единая истина fallback, обе ошибки, `config.baseUrl`, deadline вокруг фабрики, локали, полный prompt budget, настоящий render-тест -> Task 1.
- Дословные build/test/brand/process результаты и список сознательно не сделанного -> Task 1.

### Task 1: Исправить и принять замечания ревью одним интеграционным срезом

**Files:** `.codex/handoff.md`, `libraries/nestjs-libraries/src/openai/*`, `libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts`, `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, `apps/frontend/src/components/settings/ai-provider.component.tsx`, locale JSON, search/settings tests, implementation report and stage artifacts.

**Boundary:** owner `root`; rollback — рабочее дерево ветки `codex/search-provider-openrouter`; доказательство — focused red/green, затем один полный набор `build`, `test`, `brand-scan`, process verification и `git diff --check`.

**Interfaces:** сохраняет `WebResearchResult` и API настроек; `searchProvider` остаётся только `tavily`, `provider` результата остаётся структурным; `searchDepth` снова сохраняется и редактируется.

**Verification lane:** `tdd-required` — меняются условия платного fallback, prompt ceilings, сериализация настроек и пользовательский контрол.

- [ ] Добавить точечные падающие тесты для всех регрессий.
- [ ] Реализовать полный набор исправлений и обновить текущую документацию.
- [ ] Запустить один итоговый набор приёмки и сохранить дословный вывод.
- [ ] Проверить diff, обновить Beads/handoff/Graphify-решение и закрыть этап.
