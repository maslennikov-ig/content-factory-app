# Собственная рассылка через Listmonk

**Статус:** развёрнуто на `factory.aidevteam.ru` 2026-08-18. Роль и база в
`cf-next-postgres`, контейнер `cf-next-listmonk`, публичный список с двойным
подтверждением (`id 3`), отдельный API-пользователь `contentfactory` с единственным
правом `subscribers:manage`, Root URL через прокси продукта, пять
`LISTMONK_*` в `app.env`. Проверено тем же вызовом, который делает продукт:
`POST /api/subscribers` отвечает `200`, подписка ложится `unconfirmed`.

**SMTP настроен 2026-08-19.** Listmonk отправляет через `smtp.resend.com:587`
STARTTLS, пользователь `resend`, пароль — тот же ключ Resend, которым
пользуется продукт. Отправитель — `Content Factory <noreply@smtp.aidevteam.ru>`.
Обе заводские заглушки установщика (`smtp.yoursite.com`, `smtp.gmail.com`)
отключены. Проверено двумя способами: Listmonk в логе поднимает
`initialized email (SMTP) messenger: resend@smtp.resend.com`, и прямая
SMTP-сессия с тем же ключом проходит аутентификацию и принимается сервером.

Content Factory использует `listmonk/listmonk:v6.2.0` во внутренней Docker-сети.
Адрес передаётся только для нового аккаунта с
`subscribeToNewsletter=true`. Отсутствующее значение и `false` ничего не
делают; вход существующего пользователя и поздняя активация аккаунта тоже не
подписывают. Сбой Listmonk не откатывает созданный аккаунт и пишет только
обезличенное сообщение об ошибке. Ответ регистрации ждёт первую попытку не
дольше 2,5 секунд суммарно — этот бюджет общий на весь вызов, включая
восстановление по HTTP 409. После отказа backend запускает versioned Temporal
workflow, который повторяет доставку по сохранённому согласию.

Синтетические идентификаторы федеративных провайдеров (Telegram, Farcaster)
исключены на сервере, а не только в форме: список пригодных провайдеров и
проверка формы адреса живут в
[newsletter.consent.ts](../../libraries/helpers/src/auth/newsletter.consent.ts),
и обе стороны — форма и `auth.service` — читают именно его.

Регистрация с галочкой требует двух столбцов в `User`; их применение описано в
[runbook развёртывания](production-deploy.md#если-изменилась-prisma-схема).

Listmonk v6.2.0 требует поле `name` в subscriber API. Приложение не собирает и
не выводит из профиля ещё одно персональное поле: всем таким записям передаётся
одинаковая нейтральная метка `Content Factory subscriber`.

## Отсутствующий Listmonk продукт не роняет

`cf-app` не зависит от `cf-listmonk` и не ждёт его. Nginx резолвит рассылку
переменной и на каждом запросе (`resolver 127.0.0.11` в
[nginx.conf](../../var/docker/nginx.conf)), поэтому неподнятый контейнер даёт 502
только на `/newsletter/*`, а остальной продукт работает.

Это не косметика: литеральное имя в `proxy_pass` nginx резолвит один раз, при
загрузке конфигурации, и при неудаче отказывается стартовать — а точка входа
образа идёт под `set -e`, так что вместе с nginx падают бэкенд, фронтенд и
оркестратор, и `restart: unless-stopped` повторяет это по кругу. Проверяется это
только запуском: `scripts/release/verify-nginx-config.sh <образ>` просит собранный
образ загрузить конфигурацию с `--network none`, то есть ровно в том состоянии,
когда рассылки на хосте ещё нет. Шаг входит в развёртывание.

## Память хоста — решение владельца

Перед развёртыванием сложите потолки **всех** контейнеров хоста, а не только
своих. `cf-listmonk` добавляет 384 МиБ к существующим 3264 МиБ стека
(см. таблицу в [runbook развёртывания](production-deploy.md)), а параллельная
ветка сбора ошибок (`content-factory-next-ry5.4`) приносит отдельный стек ещё
примерно на 896 МиБ. На хосте около 3 ГБ свободной памяти и десяток чужих
контейнеров, поэтому включение обеих веток подряд без пересчёта — способ
получить OOM у соседей. Лимиты здесь намеренно не понижены: сколько ёмкости
отдать рассылке и сбору ошибок, решает владелец хоста.

Разделение `.env`/`app.env` не является полной PostgreSQL-изоляцией:
текущий product runtime исторически входит под database owner, потому что pinned
Mastra сама выполняет runtime DDL. `content-factory-next-ry5.2.2` хранит
безопасный вынос DDL и non-owner role. До этого компрометация
`cf-app` означает компрометацию обеих баз; файлы всё равно разделены,
чтобы Listmonk DB/Super Admin secrets не были обычными process variables.

## Что доступно снаружи

Nginx пропускает только следующие пути под `/newsletter`:

- GET/POST страницы подтверждения `/subscription/optin/<UUID>`;
- GET/POST страницы настроек и отписки
  `/subscription/<campaign-UUID>/<subscriber-UUID>`;
- встроенные файлы `/public/static/*`.

Остальные пути `/newsletter/*`, включая `/admin`, `/api`, форму подписки по
e-mail, export и wipe, отвечают 404. Сам контейнер не публикует порт на хост и
не подключён к общей сети Caddy.

## Первичная настройка — действие владельца

1. Разделить два файла рядом с production Compose. В `.env` по
   [deploy/production/env.example](../../deploy/production/env.example)
   хранятся только Compose, PostgreSQL и Listmonk owner/admin secrets.
   Пароли базы и Super Admin должны быть разными случайными
   значениями. В `app.env` по
   [deploy/production/app.env.example](../../deploy/production/app.env.example)
   лежат только application runtime settings и least-privilege writer.
   `cf-app` видит `app.env`, но не видит DB/Super Admin secrets из `.env`.
   Пароль product PostgreSQL — одно и то же значение в
   `.env` `POSTGRES_PASSWORD` и в `app.env` `DATABASE_URL`; разделяются
   файлы и области видимости, а не существующая database identity.
2. Доставить [bootstrap-listmonk-db.sh](../../deploy/production/bootstrap-listmonk-db.sh)
   на хост с правами `0700`. Скрипт идемпотентно создаёт только отдельную
   login-роль и базу в существующем `cf-next-postgres`; при конфликте владельца
   он останавливается. Пароль читается внутри контейнера и не попадает в argv
   или stdin на хосте.

3. `cf-listmonk` не входит в общий `docker compose up -d` ни при первом
   развёртывании, ни при обновлении: до успешного bootstrap у него нет ни роли,
   ни базы, и он уходит в цикл перезапусков. Шаг 5 в
   [runbook развёртывания](production-deploy.md) поднимает стек поимённо и без
   него; запускается он только отсюда.

   На уже работающем инстансе сначала применить обновлённый Compose к
   `cf-postgres`, чтобы безопасные имена и пароль Listmonk появились в окружении
   контейнера, из которого их читает bootstrap. Это owner-run перезапуск с
   коротким окном недоступности; перед ним нужен актуальный backup. После этого
   выполнить bootstrap из шага 2. Только после его успеха запустить
   `cf-listmonk`. Команда контейнера
   повторяет tagged Compose v6.2.0: идемпотентная установка, затем upgrade и
   обычный запуск с пустым `--config`, то есть только из переменных окружения.
   После первого успешного входа Super Admin его bootstrap-пароль следует
   очистить из `.env` и пересоздать `cf-listmonk`; приложение постоянно
   использует только отдельный least-privilege API token.

   ```bash
   set -a
   . ./.env
   set +a
   docker compose up -d --force-recreate cf-postgres
   docker compose ps cf-postgres
   ./deploy/production/bootstrap-listmonk-db.sh
   docker compose up -d cf-listmonk
   ```
4. Admin/API постоянно наружу не публикуются. Для одноразовой настройки создать
   временный Compose override с привязкой только к loopback хоста, открыть к
   нему SSH tunnel, закончить настройку и сразу вернуть основной Compose:

   ```yaml
   services:
     cf-listmonk:
       ports:
         - "127.0.0.1:19000:9000"
   ```

   ```bash
   docker compose -f docker-compose.yaml -f /tmp/listmonk-admin.yaml \
     up -d --force-recreate cf-listmonk
   # На рабочей машине, в отдельном терминале:
   ssh -N -L 19000:127.0.0.1:19000 root@<хост>
   # После настройки на хосте:
   docker compose -f docker-compose.yaml up -d --force-recreate cf-listmonk
   rm -f /tmp/listmonk-admin.yaml
   docker port cf-next-listmonk  # вывод должен быть пустым
   ```

5. В Listmonk задать Root URL
   `https://factory.aidevteam.ru/newsletter`, настроить собственный SMTP и
   системное письмо подтверждения. Настройку **Settings → Subscriptions → Send
   opt-in confirmation** не выключать: на ней держится весь механизм. Письмо
   подтверждения уходит потому, что она включена, а приложение создаёт
   подписчика с `preconfirm_subscriptions: false`; выключенная настройка молча
   превращает double opt-in в его отсутствие. Вторую настройку —
   **Settings → Subscriptions → Show opt-in page** — тоже не выключать, причина
   ниже. Создать именно **public double opt-in
   list**: numeric id нужен для authenticated create, UUID — для безопасного
   повторного opt-in уже существующего subscriber. Создать
   отдельного API-пользователя/токен с минимальным правом добавлять subscribers;
   не использовать Super Admin в приложении.
6. Заполнить в `app.env` все пять значений сразу: `LISTMONK_DOMAIN`
   (`http://cf-listmonk:9000`), имя API-пользователя, токен, numeric id и UUID
   списка — `LISTMONK_USER`, `LISTMONK_API_KEY`, `LISTMONK_LIST_ID`,
   `LISTMONK_LIST_UUID`. До этого шага все пять пустые, и это важно: провайдер
   выбирается по наличию **любого** из них, поэтому одно заполненное значение
   даёт ошибку на каждой регистрации с галочкой вместо тихого «ничего не
   отправляем». Адрес проверяется по форме — внутренний http-URL без учётных
   данных и без пути, — а не по совпадению с именем сервиса, так что имя и порт
   контейнера остаются настройкой. Затем пересоздать только `cf-app`.
   Шаблон каждой кампании обязан содержать
   `{{ UnsubscribeURL }}`. Welcome через `/api/tx` не настраивать: письмо
   подтверждения принадлежит double opt-in механизму Listmonk.

## Чем именно держится второй шаг подтверждения

Проверено по исходникам listmonk `v6.2.0`, задача `content-factory-next-m0d`.
Вопрос был прямой: подтверждает ли подписку обычный GET, потому что тогда
префетч ссылки браузером или почтовый сканер подтвердят её за человека, и
согласие перестанет быть осознанным.

Ответ: по умолчанию нет, но держится это на двух условиях, и оба надо знать.

Решение принимает `OptinPage` в `cmd/public.go`:

```go
confirm, _ = strconv.ParseBool(c.FormValue("confirm"))
...
if confirm || !a.cfg.ShowOptinPage {
    return a.confirmOptinSubscription(c, subUUID, req.ListUUIDs, lists)
}
```

Маршрут зарегистрирован и на GET, и на POST (`cmd/handlers.go`). Отсюда:

- **`app.show_optin_page`** по умолчанию `true` (`schema.sql`), и тогда обычный
  GET рисует промежуточную страницу, которую человек должен отправить. Стоит
  выключить эту настройку — и обычный GET подтверждает сразу. Это та самая
  настройка из шага 5, которую нельзя трогать.
- **`?confirm=true` в ссылке** подтверждает при любом значении настройки:
  `FormValue` на GET читает query string. Собственное письмо Listmonk такой
  параметр не несёт — ссылка формируется с пустым query
  (`internal/manager/manager.go`), — поэтому ничего законного с этим параметром
  не приходит.

Второе условие мы не оставили на доверии: прокси продукта **выбрасывает query
string** на маршруте opt-in — `rewrite ^/newsletter(/.*)$ $1? break;` в
[nginx.conf](../../var/docker/nginx.conf). Снаружи подтвердить одним GET
нельзя, даже если настройку в админке кто-то выключит. Страница отписки и
управления при этом свой query сохраняет: письмо Listmonk ссылается на неё как
`{{ .UnsubURL }}?manage=true`. Обе половины закреплены тестом в
`tests/newsletter.subscription.test.cjs`.

Осознанное ограничение: если будущая версия Listmonk начнёт передавать в этом
query идентификаторы списков, отбрасывание их сломает opt-in по конкретному
списку. Сегодня продукт подписывает в один список, а ссылка приходит с пустым
query, поэтому цена нулевая — но при обновлении Listmonk это место надо
перечитать.

## Настройка SMTP

Выполнено 2026-08-19 через API настроек, без публикации admin наружу: сессия
Super Admin поднимается изнутри Docker-сети (`POST /admin/login`), затем
`PUT /api/settings` переписывает блок SMTP. Ключ подставляется внутри
контейнера, поэтому не попадает ни в файл на хосте, ни в список аргументов.

Раздел ниже сохранён на случай, когда настройку нужно поменять руками —
например, при смене провайдера или для отправки тестового письма из интерфейса.
Admin наружу не публикуется, поэтому доступ разовый — через loopback и SSH
tunnel:

```bash
# на хосте
cat > /tmp/listmonk-admin.yaml <<'YAML'
services:
  cf-listmonk:
    ports:
      - "127.0.0.1:19000:9000"
YAML
cd /srv/content-factory-next
docker compose -f docker-compose.yaml -f /tmp/listmonk-admin.yaml \
  up -d --force-recreate cf-listmonk

# на рабочей машине, отдельным терминалом
ssh -N -L 19000:127.0.0.1:19000 root@<хост>
# открыть http://127.0.0.1:19000/admin
```

Логин Super Admin — значения `LISTMONK_ADMIN_USER` и `LISTMONK_ADMIN_PASSWORD`
из `/srv/content-factory-next/.env`. Пароль сгенерирован на сервере и нигде,
кроме этого файла, не существует; прочитать его надо там же, а не переспрашивать.

В интерфейсе: **Settings → SMTP**, отключить заготовку `smtp.yoursite.com`,
добавить свой сервер, отправить тестовое письмо. Настройки **Show opt-in page**
и **Send opt-in confirmation** не трогать — на них держится двойное
подтверждение.

После настройки вернуть закрытый Compose и убедиться, что порт снова закрыт:

```bash
docker compose -f docker-compose.yaml up -d --force-recreate cf-listmonk
rm -f /tmp/listmonk-admin.yaml
docker port cf-next-listmonk   # вывод должен быть пустым
```

Затем очистить `LISTMONK_ADMIN_PASSWORD` из `.env` и пересоздать
`cf-listmonk`: постоянно продукт пользуется только API-токеном. Пароль Super
Admin после очистки останется рабочим — просто перестанет лежать в файле.

**Токен API-пользователя отдаётся один раз.** Он уже записан в `app.env`;
прочитать его повторно у Listmonk нельзя. Ротация — удалить пользователя
`contentfactory` и создать заново, затем заменить `LISTMONK_API_KEY`.

Остатки установщика: два демонстрационных списка (`Default list`, `Opt-in list`)
с тегом `test` и по одному подписчику `@example.com` в каждом. Продукт с ними не
работает — он пишет только в список `Content Factory`. Удалять их не обязательно.

## Проверка владельцем

До отправки реальной кампании создать тестовый новый аккаунт с отдельным
разрешённым адресом и включённой галочкой. В Listmonk membership должна быть
`unconfirmed`; после клика в системном письме — `confirmed`. Только после этого
можно отправить тестовую кампанию и проверить UUID-отписку.

Закрытую границу можно проверить без адресов и токенов:

```bash
curl -o /dev/null -w '%{http_code}\n' \
  https://factory.aidevteam.ru/newsletter/admin/          # 404
curl -o /dev/null -w '%{http_code}\n' \
  https://factory.aidevteam.ru/newsletter/api/subscribers # 404
curl -o /dev/null -w '%{http_code}\n' \
  https://factory.aidevteam.ru/newsletter/subscription/not-a-uuid # 404
```

Если authenticated create возвращает HTTP 409, провайдер вызывает
внутренний public-subscription endpoint с UUID целевого public
double-opt-in list. Listmonk так возобновляет `unconfirmed` opt-in даже
для existing/unsubscribed subscriber.

## Где хранится согласие

Согласие записывается на сам аккаунт, тем же оператором `create`, что и аккаунт:
`User.newsletterConsentAt` — момент, `User.newsletterConsentSource` — источник
(сейчас единственный, `registration`). Пустые столбцы означают, что согласия не
было. Те же два факта уходят в Listmonk в `attribs` подписчика, поэтому запись
подписчика и запись аккаунта описывают один и тот же момент.

`User.newsletterDeliveryPendingAt` записывается тем же `create` и остаётся
непустым до успешной передачи. `User.newsletterDeliveredAt` фиксирует её
завершение. Старые аккаунты получают оба новых поля пустыми и поэтому не
попадают в повторную рассылку после обновления.

Доставку арендуют поля `User.newsletterDeliveryLeaseId` и
`User.newsletterDeliveryLeaseExpiresAt`. Аренда относится одновременно к
аккаунту и точному `newsletterDeliveryPendingAt`; Prisma `updateMany` выдаёт её
только одному конкуренту. Регистрация сама Listmonk не вызывает: она лишь
пытается арендовать переход и запустить Temporal, поэтому registration и
activity не могут одновременно отправить один адрес провайдеру.

Так согласие переживает недоступность рассылки. Раньше оно жило только в теле
запроса: при сбое Listmonk данное человеком разрешение не оставалось нигде, и
восстановить его было не из чего.

Передача адреса в Listmonk — побочный эффект и может не удаться. После отказа
backend запускает `newsletterSubscriptionRetryWorkflowV1` со стабильным
`workflowId` `newsletter-subscription-v1:<userId>:<pendingEpochMs>` для
конкретного pending-перехода, политикой `USE_EXISTING` для работающего запуска и
`ALLOW_DUPLICATE_FAILED_ONLY`: завершённая доставка не повторяется, исчерпавшийся
после ограниченных попыток workflow можно запустить снова, а новое согласие того
же аккаунта получает новый id. Повторная аренда сохраняет тот же lease id:
потерянный ответ на `workflow.start` повторяет тот же workflow, а не создаёт
второго владельца доставки. В аргументах есть только `userId`,
время pending-перехода и непрозрачный lease id; адрес не попадает в историю
Temporal или лог.

Новая activity `deliverNewsletterSubscriptionV1` перед каждой доставкой заново
читает аккаунт. Без совпадающих pending-перехода и lease, действующего согласия
или доставляемого адреса она успешно завершает workflow без обращения к
Listmonk. После успешного ответа Listmonk activity атомарно очищает pending-
состояние только для прочитанного момента и lease.
При наличии согласия она вызывает тот же идемпотентный provider: существующий
subscriber восстанавливается через public double-opt-in endpoint, новая строка
subscriber не дублируется.

Retry ограничен восемью попытками. Первая задержка — одна минута,
коэффициент — 2, максимальная задержка — один час, timeout одной activity —
30 секунд. Исчерпание попыток видно в Temporal; бесконечного workflow нет.

Если недоступен Temporal, регистрация остаётся успешной, а в логе появляется
обезличенная строка:

```
Newsletter retry scheduling failed after account creation. user=<id>
```

Ручной перенос адреса не нужен. Backend раз в минуту выбирает не более 100
аккаунтов с неарендованным или истёкшим `newsletterDeliveryPendingAt`, атомарно
арендует каждый и передаёт в Temporal только идентификатор, время перехода и
lease id. Запланированные первые 100 сразу исчезают из следующей выборки, даже
если Listmonk стабильно отвечает ошибкой, поэтому новые записи не голодают.

Lease длится три часа: это больше полного окна восьми activity-попыток с
backoff. Ошибка запуска Temporal освобождает lease сразу; ошибка провайдера
оставляет его за текущим workflow на время bounded retry. После сбоя процесса
истёкший lease автоматически доступен следующему reconciler. Отозванное
согласие activity проверяет повторно и очищает pending по compare-and-set без
обращения к Listmonk.

Четыре nullable-столбца и два индекса применяются только owner-run порядком из
[production-deploy.md](production-deploy.md), с реальным `prisma migrate diff`
и валидатором:

```bash
docker compose exec -T cf-app node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff /tmp/cf-prisma-diff.sql \
  --selected /tmp/cf-prisma-selected.sql \
  --allow-table User
```

`tests/prisma-schema-apply-guard.migrate-diff.test.cjs` пропускает через guard
именно SQL, который Prisma печатает для этого изменения. До применения схемы
не включайте новый backend: создание согласованного аккаунта уже пишет pending-
поле. В общем deployment runbook это точный шаг 7 секции «Если изменилась
Prisma-схема»: в selected-файле остаются только четыре nullable-столбца и два
индекса `User`, а валидатор запускается с единственным `--allow-table User`.

База Listmonk и её отдельная роль входят в тот же owner-run backup/restore, что
продукт и Temporal. Подробности — в [runbook PostgreSQL](postgres-backup.md).
