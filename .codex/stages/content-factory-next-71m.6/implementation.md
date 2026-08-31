# Пересчёт production memory limits

## Решение

Числовые значения остаются прежними: `cf-app.mem_limit` — `1792m`, heap caps
backend/orchestrator/frontend — `512/512/256 MiB`. Это повторная проверка
текущего контракта против новых данных, а не пропущенное изменение.

Текущий idle container measurement — `1010 MiB`, то есть запас до cgroup cap
составляет `782 MiB`. Задача 71m.5 убрала `googleapis` из холодного пути и
показала локальную разницу import-графа `54.47 MiB RSS`, но это не production
cgroup measurement. Снижать предел по этой цифре нельзя: после первого
Google-вызова SDK снова будет загружен, а рабочая нагрузка подключённых каналов
локально не измерена.

Общий `NODE_OPTIONS=--max-old-space-size=512`, упомянутый в Beads, уже не
соответствует `main`. Текущий image запускает PM2 ecosystem с разными caps для
трёх процессов. Возвращать общий cap или прежние `2 GiB` не требуется.

## Проверяемый контракт

Новый focused-тест связывает production `Dockerfile` с entrypoint и PM2
ecosystem, проверяет `1792m`, точные три heap caps, запас не меньше `512 MiB`
вне суммы old-space и запрет container-wide `NODE_OPTIONS` в обеих формах
Compose environment.

## Риски и восстановление

Числовой runtime limit эта ветка не меняет, поэтому её revert удалит только
пояснение и regression guard. Любая будущая корректировка cap требует замера
`content-factory-next-71m.7` на реально развёрнутой ревизии и отдельной
авторизации на deploy/server access.

`docs-reviewed: updated` — rationale сохранён рядом с `mem_limit`.

`project-index: reviewed-no-change` — новый стабильный entrypoint не появился.

`graph-reviewed: blocked` — `graphify-out/graph.json` отсутствует, focused
`graphify query` завершился сообщением `graph file not found`.
