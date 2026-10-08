# Проверка схемы и сохранение проверенного отката

Эти шаги выполняет оператор в рамках отдельно разрешённого релиза. Helper не
применяет схему, не скачивает образ или движок и не изменяет конфигурацию приложения.

Перед переключением запишите проверенный активный tag из контейнера и сохраните
его как rollback для нового релиза. Время создания другого образа не подтверждает
его принятие: на хосте могут лежать более новые непринятые кандидаты.

После проверок нового релиза используйте явный rollback tag:

```bash
CF_DEPLOY_HOST=root@<host> CF_ROLLBACK_TAG=<verified-previous-tag> \
  scripts/release/retain-host-artifacts.sh --dry-run
CF_DEPLOY_HOST=root@<host> CF_ROLLBACK_TAG=<verified-previous-tag> \
  scripts/release/retain-host-artifacts.sh
```

Без `CF_ROLLBACK_TAG`, при отсутствии образа или совпадении с активным tag
удаление запрещено. Удерживаются активный и указанный rollback; при `CF_KEEP>2`
добавляются новые оставшиеся tags. Копии конфигурации с именами активного и rollback
сохраняются сверх `CF_KEEP_BACKUPS`. Ограничения общего хоста и постоянное разрешение
на удаление только собственных release артефактов остаются в production runbook.

Перед переключением и после него выполните проверку схемы в **самом candidate
образе**. На deployment хосте разместите оба отслеживаемых файла
`scripts/release/schema-preflight.sh` и `schema-preflight.cjs` рядом и запустите:

```bash
CF_SCHEMA_ENGINE_PATH=/absolute/verified/schema-engine \
  /absolute/release-tools/schema-preflight.sh <candidate-tag>
```

`CF_APP_ENV_PATH` по умолчанию `/srv/content-factory-next/app.env`,
`CF_SCHEMA_NETWORK` — `content-factory-next_internal`. Все mounts только для чтения;
контейнер имеет read-only root и собственный временный `/tmp`. Целевой образ должен
уже находиться на хосте. Helper использует readonly introspection (`migrate diff`)
через Prisma CLI внутри этого образа и сравнивает с его собственной Prisma-схемой.

Текущий проверенный контракт: Prisma **6.5.0**, native engine version
`173f8d54f8d52e692c7e27e72a88314ec7aeff60`, SHA-256 исполняемого движка
`431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2`.
Используйте имеющийся проверенный файл именно этой версии. Helper проверяет
package version, engine dependency, checksum и `--version`; другой engine или
обновление Prisma требуют отдельного изменения pins и проверки. Native schema
engine нельзя подменять query engine. Его наличие в runtime не предполагается;
этот bounded helper явно монтирует проверенный движок, не меняя образ.

Успех — exit **0** и JSON с `ok:true`, `diffExitCode:0`, `sqlLines:0`,
`schemaApplied:false`. Дополнительно привяжите этот результат к digest проверенного
образа и текущему контейнеру в release receipt. Непустой SQL, ошибка CLI, отсутствие
engine или неверный env являются отказом, даже когда stdout пустой. Успешный diff
проверяет Prisma-схему; состояние таблиц Mastra и работа приложения проверяются
отдельными существующими release шагами.

Quoted `app.env` разбирается библиотекой dotenv внутри образа. `DATABASE_URL`
передаётся дочернему Prisma процессу только в environment: отсутствует в argv,
логе и сохранённых файлах. Raw stdout/stderr Prisma не выводятся. Docker stderr
также скрыт: отказ выдаёт только безопасный код причины. Временные файлы содержат
container ID и безопасный результат; trap удаляет только собственный контейнер и
собственную временную папку. Исходные env и engine остаются на месте. Никогда не
добавляйте `db push` или применение SQL к этой проверке.
