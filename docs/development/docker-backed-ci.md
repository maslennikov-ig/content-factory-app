# Docker-backed проверки в CI

## Зачем нужен отдельный запуск

Обычная сборка не доказывает Docker-контракты. Два Jest-набора допускают
локальный `describe.skip`, когда соответствующая возможность Docker
недоступна. Поэтому workflow `Build` содержит отдельную обязательную задачу
`Docker-capable execution proofs (required)`. Она запускает
`scripts/ci/run-docker-backed-ci.sh --require-docker` и не может стать зелёной
за счёт пропущенных тестов.

## Обязательная матрица

Runner последовательно выполняет:

| Проверка                                                | Что доказывает                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tests/browser-error-relay.test.cjs`                    | реальный nginx proxy-hop, независимые бюджеты страниц и точную передачу строгого media type |
| `tests/error-collector.compose.test.cjs`                | реальный `docker compose config` для стека сборщика ошибок                                  |
| `tests/postgres-role-isolation.execution.test.cjs`      | порядок и изоляцию ролей на одноразовом PostgreSQL                                          |
| `scripts/operations/verify-mastra-storage-migration.sh` | реальную миграцию 29 таблиц Mastra, функции, триггера, данных и отказы небезопасных случаев |
| `scripts/operations/verify-postgres-backup-restore.sh`  | реальный цикл резервной копии и восстановления всех PostgreSQL-баз и ролей                  |

Jest сохраняет машинный результат во временный файл. Проверка
`scripts/ci/assert-docker-jest-result.cjs` требует ненулевого числа тестов,
нулевого числа ошибок и нулевого числа пропусков. Поэтому успешный exit code
Jest после `describe.skip` не считается доказательством.

## Обязательный режим CI

```bash
./scripts/ci/run-docker-backed-ci.sh --require-docker
```

Режим завершается ошибкой, если отсутствует Docker CLI, недоступен daemon,
нет Compose plugin или нельзя получить любой из требуемых образов:
`postgres:17-alpine` и `nginx:alpine`. При отсутствии локального образа CI явно
выполняет `docker pull` для него до запуска Jest; operational scripts сами
ничего не скачивают. Поэтому чистый CI runner не может превратить реальный
nginx-тест в `describe.skip`, а общий JSON-guard дополнительно требует ноль
пропущенных тестов во всех трёх suites.

## Локальный режим без Docker

```bash
./scripts/ci/run-docker-backed-ci.sh
```

Локальный запуск выполняет ту же матрицу, если все условия доступны. Иначе он
завершается успешно только как явно обозначенный пропуск и сообщает конкретную
причину:

- Docker CLI отсутствует или не находится в `PATH`;
- Docker daemon недоступен;
- Compose plugin недоступен;
- любой локальный образ `postgres:17-alpine` или `nginx:alpine` отсутствует;
  локально runner их не скачивает.

Это различие намеренное: разработчик без Docker получает точный диагноз, а
обязательная задача CI работает fail-closed. Runner использует только
одноразовые ресурсы существующих проверок и не обращается к production,
учётным данным или живым пользовательским данным.
