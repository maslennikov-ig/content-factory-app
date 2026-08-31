# Stage `content-factory-next-71m.6` — production memory limits

**Статус:** accepted

**Дата:** 2026-08-18

**Ветка:** `work/compose-memory-limits` от `main` `04f9f6d7`

**Модель:** Терра (эскалация с Луны: требовалось решение по запасу памяти)

## Что изменилось для пользователя и оператора

Приложение сохраняет предел `1792 MiB`: на общем хосте runaway остаётся
ограничен нашим контейнером, но рабочие процессы не лишаются неподтверждённого
запаса. Backend, orchestrator и frontend по-прежнему получают разные heap caps
`512/512/256 MiB`, а не один общий `NODE_OPTIONS`.

## Как проверить вручную

1. Без запуска контейнеров выполнить `docker compose ... config --quiet` с
   локальными placeholder-переменными.
2. Убедиться, что `cf-app.mem_limit` равен `1792m`, а production entrypoint
   запускает `/app/var/docker/ecosystem.config.js`.
3. После отдельного будущего deploy и отдельного разрешения измерить
   `memory.current` при обычной нагрузке и подключённых каналах; до этого limit
   не снижать.

## Проверенные сценарии

- Нормальный: точные cgroup/heap caps и не менее `512 MiB` вне суммы old-space.
- Регрессия: общий `NODE_OPTIONS` в list или mapping syntax отклоняется.
- Скрытый consumer: тест доказывает цепочку Dockerfile → entrypoint → PM2
  ecosystem, а не проверяет неиспользуемый конфиг.
- Не проверены: production cgroup/RSS, OOM под нагрузкой, первый реальный
  Google-вызов. Это `content-factory-next-71m.7` и требует отдельной власти.

## Приёмка

Focused contract, статический compose config, artifact/stage validators и
независимый correctness review зелёные. Каноническая release-приёмка хранится
в `acceptance-receipt.json` и является источником точных итоговых результатов.

`project-index: reviewed-no-change` — новый стабильный entrypoint не появился;
изменён только контракт существующего production compose.

`docs-reviewed: updated - production compose теперь объясняет, почему локальная дельта RSS задачи 71m.5 не является основанием снижать cgroup limit.`

`graph-reviewed: blocked - graphify-out/graph.json отсутствует; focused query завершился сообщением graph file not found.`

## Файлы

- `deploy/production/docker-compose.yaml`
- `tests/production-compose-memory-limits.test.cjs`
- `.codex/goals/content-factory-next-71m.6/scope-criterion-snapshot.json`
- `.codex/stages/content-factory-next-71m.6/**`
- `.codex/handoff.md`
- `.codex/orchestrator.toml`
- `docs/design/desert-lab/platform-card.md` — разрешённое владельцем малое
  исправление старой ссылки, блокировавшей общий docs gate.
