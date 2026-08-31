# Перенос способов входа

Скрипт `scripts/operations/backfill-user-identities.cjs` создаёт первую
`UserIdentity` из совместимых полей `User.providerName/providerId`. Для
`LOCAL` он использует нормализованный email: пробелы по краям удаляются,
регистр приводится к нижнему.

## Шаг 1. Таблица `UserIdentity` в базе

Перед переносом нужна сама таблица. Применяйте её процедурой «Если изменилась
Prisma-схема» из [runbook развёртывания](production-deploy.md): `migrate diff`
печатает SQL, вы вручную отбираете свои операторы в отдельный файл, валидатор
`scripts/operations/validate-prisma-migration-sql.cjs` проверяет отбор, и только
после этого `psql` применяет проверенный файл одной транзакцией. `prisma db
push` на этой базе запускать нельзя: рядом в схеме `public` живут 29 таблиц
`mastra_*`, которых нет в `schema.prisma`.

Собственных операторов у этого выпуска ровно четыре, все аддитивные. Ниже —
что именно должен напечатать `migrate diff`; порядок двух `CREATE INDEX` может
отличаться:

```sql
-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerIdentifier" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerIdentifier_key" ON "UserIdentity"("provider", "providerIdentifier");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Отбирайте эти четыре оператора **тем текстом, который напечатал diff**:
валидатор сравнивает выбранный файл с diff посимвольно и отклонит любую правку
руками. `ON DELETE CASCADE` — часть внешнего ключа, а не отдельная операция
удаления; убирать его ради прохождения проверки нельзя, это потеря ссылочной
целостности.

Таблица здесь одна, поэтому валидатору хватает одного разрешения:

```bash
docker compose exec -T cf-app node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff /tmp/cf-prisma-diff.sql \
  --selected /tmp/cf-prisma-selected.sql \
  --allow-table UserIdentity
```

Ничего, кроме этих четырёх операторов, выпуск в схему не добавляет: столбцы
`User` не меняются, поле `User.providerName` остаётся на месте.

## Шаг 2. Отчёт без записи

Сделайте проверенную резервную копию PostgreSQL. Сначала всегда запустите
только отчёт:

```bash
node scripts/operations/backfill-user-identities.cjs
```

Без `--apply` скрипт не пишет в БД. Проверьте `planned`, `existing` и каждый
элемент `conflicts`. Пустой внешний `providerId`, повтор одной пары
provider/identifier или уже занятая другим пользователем identity блокируют
применение.

По умолчанию отчёт счётный: вместо списка `identities` печатается только
`identitiesWithheld` — их число. Список — это все адреса всех пользователей
развёртывания, и он не должен попадать в тикет или лог просто потому, что
кто-то посмотрел отчёт. Когда адреса нужны для разбора конфликта, добавьте
`--print-identities`. Сами конфликты печатаются полностью всегда: их немного,
и без имени аккаунта их не починить.

### Что делать с конфликтами

- `missing-provider-identifier` — у аккаунта пустой `providerId` при внешнем
  провайдере (или пустой email при `LOCAL`). Такая запись не может получить
  identity: восстановите значение из журналов провайдера либо заблокируйте
  аккаунт и исключите его из переноса, договорившись с владельцем.
- `duplicate-legacy-identity` — два legacy-аккаунта дают одну и ту же пару
  provider/identifier; для `LOCAL` это обычно два адреса, различающиеся только
  регистром. Решите, какой аккаунт остаётся владельцем адреса, и смените email
  второму до переноса. До этого решения вход у обоих недетерминирован — база
  вернёт любой из них.
- `identity-owned-by-another-user` — identity уже создана и принадлежит другому
  аккаунту. Это состояние появляется только после частичного переноса или
  ручной вставки; сверьте, какой аккаунт настоящий владелец, и удалите лишнюю
  строку `UserIdentity` до повторного запуска.

Скрипт при любом конфликте не пишет ничего: он не выбирает победителя за вас.

## Шаг 3. Запись

После устранения конфликтов повторите отчёт. Затем откройте окно обслуживания:
остановите регистрацию, вход, привязку/отвязку способов входа и сброс пароля на
всех backend-репликах. Флаг ниже является явным подтверждением оператора, а не
самостоятельной блокировкой трафика. Не используйте его при работающих auth
записях.

Выполните запись явно:

```bash
node scripts/operations/backfill-user-identities.cjs --apply --auth-writes-disabled
```

Операция добавляет только отсутствующие identity в одной транзакции, затем
заново читает все legacy User и UserIdentity и автоматически запускает
post-apply dry-run. Успех требует `verification.planned: 0` и пустой
`verification.conflicts`. После этого вручную повторите обычный dry-run,
сохраните оба отчёта и только затем верните auth-трафик.

Legacy-поля не удаляются. Поэтому код можно откатить без обратного переноса
данных; таблицу при таком откате оставьте на месте.
