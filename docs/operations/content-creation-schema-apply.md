# Применение схемы раздела «Контент» к боевой базе

**Эпик:** `content-factory-next-07h`, задача `content-factory-next-07h.9`

**Что применяется:** четыре модели (`ContentPiece`, `ContentDerivation`,
`BrandVoiceSample`, `BrandVoiceMeasurement`) и одна колонка
(`ContentSource.usagePurpose`), добавленные эпиком `content-factory-next-36r`.

**Проверенный текст операторов — два файла, не один:**
[`epic-36r-tables-migrate-diff.sql`](../../.codex/stages/content-factory-next-07h/artifacts/epic-36r-tables-migrate-diff.sql)
(колонка и три таблицы) и
[`brand-voice-measurement-migrate-diff.sql`](../../.codex/stages/content-factory-next-07h/artifacts/brand-voice-measurement-migrate-diff.sql)
(четвёртая таблица). Почему два — в разделе «Чего не хватало в первом файле».

---

## Что это за файл и откуда он взялся

125 строк, 25 операторов, **ни одного `DROP` и ни одного `TRUNCATE`** —
проверено поиском по файлу. Получен офлайн, без подключения к какой-либо базе:

```bash
git show ca762437~1:libraries/nestjs-libraries/src/database/prisma/schema.prisma > /tmp/base.prisma
npx prisma migrate diff \
  --from-schema-datamodel /tmp/base.prisma \
  --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --script
```

`ca762437` — коммит, добавивший первую из новых моделей; его родитель несёт
схему, с которой боевая база жила до эпика `36r`.

## Чего не хватало в первом файле

Первый файл назывался дифом всего эпика `36r`, а нёс только три таблицы из
четырёх: `ContentPiece`, `ContentDerivation`, `BrandVoiceSample` и колонку
`ContentSource.usagePurpose`. `BrandVoiceMeasurement` в него не попала —
модель добавлена коммитом позже, чем тот, до которого снимали диф.

Валидатор этого не ловит и не должен: он проверяет, что в файле нет лишнего,
а не что в нём есть всё. Список `--allow-table` — разрешение, а не требование.

Обнаружено при применении 23.08.2026: после первого файла в базе стало 70
таблиц вместо ожидаемых 71. Недостающая таблица получена тем же офлайновым
способом — `prisma migrate diff` от схемы «как на боевой сейчас» (текущая
`schema.prisma` минус эта модель и две обратные связи на неё) к текущей
`schema.prisma`, — проверена валидатором с `--allow-table BrandVoiceMeasurement`
и применена вторым проходом.

Урок на будущее: сверять не только «нет лишнего», но и «есть всё» — числом
таблиц до и после, а не доверием к имени файла.

## Почему не `prisma db push`

Боевая база держала хранилище Mastra в той же схеме `public`: 29 таблиц
`mastra_*`, которых нет в `schema.prisma`. `db push` считает их дрейфом и
удаляет.

**С 21.08.2026 это уже не так:** переход на runtime-роли вынес Mastra в
отдельную базу `contentfactory_mastra`, и в продуктовой базе `contentfactory`
таблиц `mastra_*` ноль — проверено 23.08.2026. Запрет `db push` остаётся в
силе по остальным причинам (он не спрашивает, что именно сносит), но сверка
«29 до и 29 после» больше не про продуктовую базу: считать надо в
`contentfactory_mastra` и убеждаться, что её никто не трогал. На развёртывании 17.08.2026 предпросмотр показал `DROP TABLE` для 21
таблицы `mastra_*` вместе с одним нужным `CREATE TABLE`. Барьер
`--accept-data-loss` не спасает: пустую таблицу он сносит молча.

Правило без исключений: **точечный `psql` из проверенного валидатором файла и
никогда `prisma db push`**. То же правило и по тем же причинам записано в
[`production-deploy.md`](production-deploy.md).

## Проверка файла перед применением

Штатный валидатор репозитория. Запускается локально, к базе не подключается:

```bash
A=.codex/stages/content-factory-next-07h/artifacts/epic-36r-tables-migrate-diff.sql
node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff "$A" --selected "$A" --mode update \
  --allow-table ContentPiece \
  --allow-table ContentDerivation \
  --allow-table BrandVoiceSample \
  --allow-table BrandVoiceMeasurement \
  --allow-table ContentSource
```

Ожидаемый ответ: `SQL apply guard passed: 25 explicitly selected statement(s).`

Пять разрешённых таблиц — ровно те, которых касается диф: четыре создаются,
пятая (`ContentSource`) получает колонку. Любая шестая в выводе валидатора
означает, что схема ушла вперёд и файл надо перегенерировать.

## Порядок применения

Выполняется на сервере, в каталоге `/srv/content-factory-next`, с загруженным
owner-`.env`. Требует отдельного решения владельца: это изменение боевой базы.

1. **Сосчитать таблицы Mastra до применения.**

   ```bash
   docker compose exec -T cf-postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
     "SELECT count(*) FROM information_schema.tables
       WHERE table_schema='public' AND table_name LIKE 'mastra\_%';"
   ```

   Запишите число. В продуктовой базе `contentfactory` ожидается **0** — с
   21.08.2026 Mastra живёт в базе `contentfactory_mastra`, где этих таблиц 29.
   Проверять стоит обе: в продуктовой их быть не должно, в отдельной их число
   не должно измениться.

2. **Скопировать проверенный файл на сервер** и применить одной транзакцией:

   ```bash
   docker compose exec -T cf-postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
     < epic-36r-tables-migrate-diff.sql
   ```

   `ON_ERROR_STOP=1` обязателен: без него `psql` продолжит после первой ошибки
   и оставит схему наполовину применённой.

3. **Сосчитать таблицы Mastra после.** Та же команда, что в шаге 1. Число
   обязано совпасть. Не совпало — остановиться и разбираться, а не продолжать.

4. **Проверить, что новое на месте.**

   ```bash
   docker compose exec -T cf-postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
     "SELECT table_name FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('ContentPiece','ContentDerivation',
                            'BrandVoiceSample','BrandVoiceMeasurement')
       ORDER BY 1;"
   ```

   Четыре строки. Плюс колонка:

   ```bash
   docker compose exec -T cf-postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
     "SELECT column_name FROM information_schema.columns
       WHERE table_name='ContentSource' AND column_name='usagePurpose';"
   ```

## Откат

Все операторы аддитивны, поэтому откат — это удаление добавленного, и он
безопасен ровно до тех пор, пока в новые таблицы никто не записал данные.

```sql
DROP TABLE IF EXISTS "ContentDerivation";
DROP TABLE IF EXISTS "ContentPiece";
DROP TABLE IF EXISTS "BrandVoiceMeasurement";
DROP TABLE IF EXISTS "BrandVoiceSample";
ALTER TABLE "ContentSource" DROP COLUMN IF EXISTS "usagePurpose";
```

Порядок именно такой: `ContentDerivation` ссылается на `ContentPiece`,
`BrandVoiceMeasurement` — на `BrandVoiceSample`.

После отката приложение отвечает `P2021` на любой запрос к разделу «Контент» —
это ожидаемое поведение Prisma, когда таблицы нет, а не поломка.

## Локальная база разработки

К локальной базе схема применяется обычным `prisma db push` — там нет ни
Mastra, ни данных, которые жалко.

Ловушка машины разработчика: порт 5432 может держать Postgres **другого
проекта**. Проверяйте `docker ps` перед работой с базой. Собственные
контейнеры разработки подняты на свободных портах:

```
cf-dev-postgres  → localhost:5433
cf-dev-redis     → localhost:6380
cf-dev-temporal  → localhost:7234, интерфейс на 8234, namespace cf-dev
```

`DATABASE_URL`, `REDIS_URL`, `TEMPORAL_ADDRESS` и `TEMPORAL_NAMESPACE` в `.env`
рабочего дерева указывают на них.

Отдельный Temporal нужен по той же причине, что и отдельный Postgres. Общий
локальный сервер держит `organizationId` и `postId` типа `Text` от старой
версии продукта, а код регистрирует их как `Keyword`; `TemporalRegister`
на этом останавливает запуск. Новое пространство имён не спасает — при
включённом Elasticsearch пользовательские атрибуты живут на уровне кластера.
Удалять их не нужно: это общее состояние, от которого зависят рабочие процессы
в соседних пространствах.

## Что изменилось после эпика `content-factory-next-07h`

До этого эпика четыре таблицы были схемой без потребителя: их отсутствие на
боевой базе ничего не ломало, потому что к ним никто не обращался. Теперь
обращается весь раздел «Контент» — образцы, замеры, материалы и происхождение
идут через них.

Что это значит для применения:

- До применения раздел «Контент» на боевой откроется, но голос собрать не
  удастся: маршруты `/content-intelligence/voice/*` и
  `/content-intelligence/materials` вернут ошибку базы. Экран покажет её
  причиной — это не поломка интерфейса.
- После применения ничего дополнительно делать не нужно: перезапуск
  приложения не требуется, Prisma-клиент уже знает эти модели.
- Порядок, проверка валидатором и сверка числа таблиц `mastra_*` не менялись —
  они выше на этой странице.

## Применено

23.08.2026, с разрешения владельца, на `factory.aidevteam.ru`, база
`contentfactory`.

| Что | Значение |
|---|---|
| До | 67 таблиц, `mastra_*` в продуктовой базе — 0 |
| Копия перед изменением | `/srv/content-factory-next/backup-pre-07h-20260823T045629Z.sql.gz`, целостность gzip проверена |
| Первый проход | 25 операторов, `--single-transaction`, `ON_ERROR_STOP=1` → 70 таблиц |
| Второй проход | 6 операторов (`BrandVoiceMeasurement`), так же → 71 таблица |
| После | четыре таблицы на месте, `ContentSource.usagePurpose` со значением `EVIDENCE` |
| Владелец объектов | `contentfactory`, как и у остальных 67 таблиц |
| Права приложения | `contentfactory_runtime` получила SELECT/INSERT/UPDATE/DELETE автоматически, через `ALTER DEFAULT PRIVILEGES` |
| Дрейф | ноль: перечень колонок продуктовой базы совпал с локальной, применённой из `schema.prisma`; единственные различия — таблицы `mastra_*`, которых на боевой нет по своей причине |
| Приложение | не перезапускалось, контейнеры healthy, `https://factory.aidevteam.ru` отвечает 200 |

**Чего это ещё не даёт.** На боевой работает образ `0eec171a` от 22.08.2026 —
код эпика `content-factory-next-07h` туда не выкачен. Таблицы стоят пустыми и
ждут развёртывания, которое остаётся отдельным решением владельца.
