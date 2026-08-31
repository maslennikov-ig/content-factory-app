# Stage `content-factory-next-71m.5` — память backend

**Статус:** accepted

**Дата:** 2026-08-18

**Ветка:** `work/backend-memory-survey` от `main` `04f9f6d7`

**Модель:** Сол

## Что изменилось для пользователя

Холодный запуск backend больше не загружает большой Google SDK только ради
того, чтобы показать список платформ. Google login, YouTube и Google My
Business продолжают работать по прежним контрактам; SDK загружается при первом
реальном действии с Google и затем переиспользуется.

## Как проверить вручную

1. На локальном стенде открыть Google login и убедиться, что редирект ведёт на
   тот же callback со scope профиля и адреса.
2. Подключить тестовый YouTube или Google My Business аккаунт, повторить вход и
   открыть список страниц/каналов. Первый вызов может включать единовременную
   холодную загрузку SDK; следующие не должны её повторять.
3. До Google-действия запустить import probe из `implementation.md`: после
   импорта `IntegrationManager` ни один путь `googleapis` не должен появиться в
   `require.cache`.

Реальные аккаунты и браузерный OAuth в этом прогоне не использовались.

## Измеренный результат

- Production-факт до изменения из задания: 380 600 KB RSS, 20 потоков.
- Изолированный `googleapis`: медиана +93.09 MiB RSS и +45.45 MiB heap.
- Реальный TS import-граф `IntegrationManager`: 202.62 → 148.15 MiB RSS,
  3305 → 2396 модулей. Локальная разница: **54.47 MiB RSS**.
- `@prisma/client`: +17.95 MiB RSS; он нужен всему backend и не был усложнён.
- CopilotKit уже загружается лениво в `main`; Facebook business SDK отсутствует.

Значения пакетов нельзя складывать: зависимости пересекаются. Точный итог для
запущенного контейнера можно измерить только после будущего развёртывания,
которое не входит в этот прогон.

## Проверенные сценарии

- Нормальный: оценка трёх provider modules не загружает SDK; первый OAuth
  вызов загружает; URL/scopes/token/user shapes прежние.
- Повтор: последующие вызовы используют одну Promise и не повторяют импорт.
- Соседний путь: Copilot controller остаётся зелёным и не загружает runtime,
  пока AI не настроен.
- Не проверены: реальный Google OAuth, реальный backend container, connected
  Prisma engine/pool, параллельный первый Google-вызов отдельным стресс-тестом.

## Файлы

- `apps/backend/src/services/auth/providers/google.provider.ts`
- `libraries/nestjs-libraries/src/integrations/social/gmb.provider.ts`
- `libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts`
- `tests/backend-memory.googleapis-lazy.test.cjs`
- `.codex/goals/content-factory-next-71m.5/scope-criterion-snapshot.json`
- `.codex/stages/content-factory-next-71m.5/**`
- `.codex/handoff.md`
- `.codex/orchestrator.toml`
- `docs/design/desert-lab/platform-card.md` — разрешённое владельцем малое
  исправление старой ссылки, которая блокировала общий docs gate.

## Ограничения и дальнейшие шаги

- `content-factory-next-71m.7`: production before/after RSS после будущего
  owner-controlled deploy; здесь deploy, SSH и server access не выполнялись.
- Mastra/MCP остаётся кандидатом на отдельное исследование, но текущий профиль
  не оправдывает широкий рефакторинг в этой ветке.
- `project-index: reviewed-no-change`.
- `docs-reviewed: updated` — stage evidence.
- `graph-reviewed: blocked` — graphify-out отсутствует.

## Приёмка

- `pnpm test`: 73/73 suites; 647 passed, 1 skipped; Python 6/6.
- `pnpm run build`: frontend, backend и orchestrator успешно.
- `node scripts/branding/brand-scan.cjs`: 0 unexplained, 7 allowlisted.
- `bash scripts/orchestration/run_process_verification.sh`: OK.
- `pnpm run docs:check`: старая ссылка `../../DESIGN.md` исправлена на путь к
  корневому `DESIGN.md`; повторная проверка входит в canonical closeout.
- Focused Google/Copilot: 2 suites, 8/8; independent correctness review:
  ACCEPT, P0–P3 нет.
