# Готовность управляемого SaaS

**Аудитория:** только оператор Content Factory

**Статус:** целевой runbook; не подтверждает готовность production

**Проверено статически:** 2026-08-19

Этот документ связывает Cloud-first продуктовый контракт с существующими
операционными процедурами. Он не разрешает deployment, работу с production,
изменение secrets, платные вызовы или сообщения пользователям. Каждый live-шаг
требует отдельного текущего поручения и фактического readback.

## Граница ответственности

Оператор сервиса владеет runtime, обновлениями, миграциями, секретами,
резервированием, восстановлением, наблюдаемостью и обработкой инцидентов.
Пользователь управляет данными своего рабочего пространства, участниками,
контентом и подключёнными каналами в пределах продуктовых прав.

Публичная документация не заменяет operator runbook. Инструкция, требующая
доступа к compose, PostgreSQL, Temporal, secret store или хосту, остаётся в
`docs/operations/` и не становится пользовательским onboarding.

## Readiness gates

| Граница | Репозиторное доказательство | Что проверить в разрешённом окружении | Fail-closed результат |
| --- | --- | --- | --- |
| Точная версия и Source | `tests/source.archive.test.cjs`, ADR-0005 | публичная ссылка и manifest называют реально обслуживающий commit; архив скачивается без сессии | не открывать внешний preview |
| Runtime | [runtime.md](runtime.md), production compose | frontend, backend, orchestrator, PostgreSQL, Redis, Temporal и storage здоровы; HTTP health не подменяет provider readiness | остановить rollout, сохранить предыдущий образ |
| Схема и роли | [production-deploy.md](production-deploy.md), раздел [Пример: Cloud-first SaaS-срез](production-deploy.md#пример-cloud-first-saas-срез) | preflight, non-owner runtime roles, cross-database isolation и пятнадцать операторов среза (два `CREATE TYPE` отдельной командой, остальные через валидатор с пятью `--allow-table`) | не запускать новый backend до применённой additive schema |
| Backup и recovery | [postgres-backup.md](postgres-backup.md) | свежий проверенный artifact и репетиция восстановления совместимой версии | не выполнять необратимый шаг без recovery point |
| Error collection | [error-collection.md](error-collection.md) | события доходят, payload и proxy logs не содержат идентификаторы; retention действует | отключить collector boundary, не расширять payload |
| Outbound data | [outbound-connections.md](outbound-connections.md), ADR-0009 | каждый включённый сервис имеет четыре факта обоснования и текущую конфигурацию | неизвестный или необоснованный egress остаётся выключен |
| Tenant isolation | auth/policy и repository tests | один tenant не читает ключи, данные, events или usage другого | блокировать затронутый путь как security incident |
| Bootstrap администратора | `resolveNewUserAccess` возвращает `isSuperAdmin: false` на каждой ветке | до публичного трафика оператор выполняет [Bootstrap администратора инстанса](production-deploy.md#bootstrap-администратора-инстанса) и подтверждает ровно один `User.isSuperAdmin = true` | не открывать публичный трафик; первый посетитель не становится администратором инстанса |
| Abuse controls | focused auth/public throttle tests, [таблица порогов](configuration.md#ограничение-частоты-неаутентифицированных-post) | все четыре auth POST (`register` 1, `login` 10, `forgot` 5, `resend-activation` 3 за 60 с) считаются на одного caller и отвечают `429` при исчерпании; public-growth имеет отдельный бюджет; warning не содержит IP/User-Agent/cookie; ingress **заменяет** `X-Real-IP`/`X-Forwarded-For`, а не дополняет | не открывать публичный трафик без проверенного ingress; распределённый abuse budget остаётся отдельным readiness gate |
| Raw telemetry retention | `scripts/operations/cleanup-saas-retention.cjs`, `tests/saas-retention.test.cjs`, [`deploy/production/retention/`](../../deploy/production/retention) | `content-factory-next-saas-retention.timer` включён и в `systemctl list-timers` показывает следующий запуск в 05:30; ручной `systemctl start` завершается кодом 0, а в journal лежит JSON с `mode: apply` и нулевым `verification`. Apply удаляет только `PublicGrowthTrustedEvent` и `AiUsageRecord` старше 90 дней, требует `CF_CONFIRM_SAAS_RETENTION=apply` и совпадающий `CF_SAAS_RETENTION_TARGET` — он задан в самом unit, а не в `app.env` | остановить job при ошибке или оставшихся строках; не затрагивать `PublicGrowthDaily` вручную |
| Публичный путь | `tests/cloud-saas-contract.test.cjs` и public-route tests | только разрешённые маршруты открыты; demo использует synthetic data | вернуть публичный трафик на безопасную страницу |

Статический зелёный тест доказывает контракт кода, но не доказывает состояние
конкретного окружения. В run record фиксируются commit/image, время, оператор,
точная команда или probe и результат без значений secrets.

### Два разных права с именем SUPERADMIN

Их легко перепутать, и путаница читается как обещание безопасности, которого
нет:

- `User.isSuperAdmin` — флаг **инстанса**. Он открывает `/admin/users`,
  announcements, billing-администрирование и impersonation. Самостоятельная
  регистрация никогда его не выставляет:
  [`resolveNewUserAccess`](../../libraries/helpers/src/auth/registration.approval.ts)
  возвращает `isSuperAdmin: false` на каждой ветке, включая первую организацию
  пустой базы. Единственный способ его получить —
  [Bootstrap администратора инстанса](production-deploy.md#bootstrap-администратора-инстанса).
- `Role.SUPERADMIN` в `UserOrganization` — роль **внутри одной организации**.
  Её получает каждый самостоятельно зарегистрировавшийся человек в собственном
  рабочем пространстве
  ([organization.repository.ts](../../libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts)),
  и это ожидаемо: он владелец своего workspace. Операторских прав над
  инстансом и доступа к чужим организациям она не даёт.

Проверять на readiness нужно первый флаг, а не роль: `SELECT email FROM "User"
WHERE "isSuperAdmin" = true;` должен вернуть ровно одну ожидаемую строку.

## Trusted growth key и ежедневное удаление raw telemetry

До открытия регистрации задать отдельный стабильный secret
`PUBLIC_GROWTH_DEDUPE_KEY`. Backend использует его только как HMAC-ключ для
trusted growth receipt. Значение не выводится в лог и не должно совпадать с
`JWT_SECRET`. Ключ короче 32 байт или его отсутствие закрывают production-путь
до записи receipt; обычный hash не используется. Плановая ротация требует
отдельного перехода: немедленная замена ключа разрывает дедупликацию событий,
receipt которых ещё живёт 90 дней. Полное описание переменной —
в [Конфигурации](configuration.md#публичные-growth-events).

Repository-owned cleanup имеет фиксированное окно 90 дней и по умолчанию
работает без записи:

```bash
docker exec cf-next-app node /app/scripts/operations/cleanup-saas-retention.cjs
```

Скрипт запускается из образа приложения, а не из копии на хосте: в
`/srv/content-factory-next` лежит только `docker-compose.yaml`, `.env` и
`app.env`, а внутри образа скрипт стоит рядом с тем Prisma-клиентом, из схемы
которого он сгенерирован. Обновление образа переносит обе половины сразу, и
разъехаться они не могут.

Проверить JSON dry-run: `before` соответствует 90 дням, количества относятся
только к `publicGrowthTrustedEvents` и `aiUsageRecords`, а поле `target`
называет базу, на которую фактически смотрит `DATABASE_URL`, в форме
`host:port/database`. Ни пользователя, ни пароля, ни query-параметров в нём
нет: это значение и предназначено для того, чтобы его записали в runbook, в
строку cron и в тикет инцидента.

Apply требует **двух** независимых подтверждений:

```bash
docker exec \
  --env CF_CONFIRM_SAAS_RETENTION=apply \
  --env CF_SAAS_RETENTION_TARGET=cf-postgres:5432/contentfactory \
  cf-next-app node /app/scripts/operations/cleanup-saas-retention.cjs --apply
```

`CF_CONFIRM_SAAS_RETENTION` доказывает, что оператор намеревался удалять;
`CF_SAAS_RETENTION_TARGET` доказывает, что он знает, где. Скрипт сверяет его с
`target` из `DATABASE_URL` и отказывается **до открытия соединения**, если они
не совпадают или переменная не задана. Подставьте в команду ровно ту строку,
которую напечатал dry-run.

**`CF_SAAS_RETENTION_TARGET` задаётся в unit-файле или в строке вызова, но
никогда в `app.env`.** Это не переменная сервиса. Рядом с `DATABASE_URL` она
теряет весь смысл: правка,
переносящая инстанс на другую базу, перенесёт и ожидаемую цель, обе стороны
сверки снова совпадут, и барьер пропустит удаление на чужой базе — то есть
ровно тот случай, ради которого он существует. Значение должно приезжать из
другого места и меняться отдельной осознанной правкой.

Обе модели удаляются в одной Prisma-транзакции по строгой границе
`createdAt < before`; строка ровно на cutoff остаётся. После успешной
транзакции скрипт повторно считает просроченные строки и завершается ошибкой,
если что-то осталось. `PublicGrowthDaily` не входит ни в запросы, ни в
удаление.

### Ежедневное расписание

Расписание лежит в репозитории — пара systemd-юнитов в
[`deploy/production/retention/`](../../deploy/production/retention), рядом с
такой же парой для backup:

- `content-factory-next-saas-retention.timer` — `OnCalendar=*-*-* 05:30:00`,
  `Persistent=true`. Время выбрано так, чтобы не пересечься ни с одним
  backup-окном: репозиторный backup-timer стоит на 03:30 и на время дампа
  останавливает `cf-app`, а хост дополнительно держит nightly cleanup в 03:15
  (+30 мин случайной задержки) и полный backup в 04:15 (+10 мин). `Persistent=`
  действует только на таймеры с `OnCalendar=`, поэтому пропущенный из-за
  выключенного хоста запуск выполняется один раз после загрузки.
- `content-factory-next-saas-retention.service` — `Type=oneshot`, вызывает
  `docker exec cf-next-app node /app/scripts/operations/cleanup-saas-retention.cjs --apply`.
  Оба подтверждения объявлены в самом unit через `Environment=`:
  `CF_CONFIRM_SAAS_RETENTION=apply` и `CF_SAAS_RETENTION_TARGET`. Второе
  намеренно живёт там, где нет `DATABASE_URL`, — см. абзац выше.
  `TimeoutStartSec=15min` закрывает единственный отказ, который journal иначе
  не покажет: заблокированное на локе удаление, висящее в `activating`.

Установка на хосте (юниты доставляются тем же tar/ssh-переносом, что и
операционные скрипты, но раскладываются в `/etc/systemd/system`):

```bash
systemctl daemon-reload
systemctl enable --now content-factory-next-saas-retention.timer
systemctl list-timers content-factory-next-saas-retention.timer
systemctl start content-factory-next-saas-retention.service   # разовая проверка
```

Скрипт в образе есть всегда, отдельно его доставлять не нужно; сверить копию
можно `sha256sum` в контейнере и в репозитории.

Как оператор видит отказ: любой ненулевой код превращает unit в `failed`, он
попадает в `systemctl --failed`, а причина — в
`journalctl -u content-factory-next-saas-retention.service`. Туда же пишется
JSON успешного запуска: `mode`, `before`, `target`, счётчики удалённого и
`verification`. Environment в journal не выгружается. Значение
`CF_SAAS_RETENTION_TARGET`, не совпадающее с базой хоста, останавливает запуск
до открытия соединения — это работающий барьер, а не поломка юнита.

Перед первым расписанием на новом хосте: сначала dry-run, взять из него
`target`, вписать ровно эту строку в unit, затем один ручной `systemctl start`
и проверить `verification`.

## До внешнего preview

1. Сопоставить image/commit с Source manifest и скачать архив как посетитель без
   сессии.
2. Подтвердить, что публичный allowlist маршрутов не открывает рабочее приложение
   или tenant API.
3. До включения публичных маршрутов выполнить
   [Bootstrap администратора инстанса](production-deploy.md#bootstrap-администратора-инстанса)
   и получить readback: ровно один `User.isSuperAdmin = true`, и это ожидаемый
   адрес.
4. Пройти регистрацию и удаление тестового workspace только в разрешённом
   изолированном окружении; не использовать реальные social accounts.
5. Проверить миграции и runtime-роли по production runbook, не применяя
   `prisma db push`.
6. Получить свежий backup и выполнить предусмотренную для этого релиза recovery
   proof до любого необратимого изменения.
7. Проверить error relay, redaction, retention и отсутствие browser identifiers
   в proxy/collector logs.
8. Проверить auth/public abuse controls через ingress: лимиты должны быть
   per-caller, исчерпание — давать `429` и warning без сырого адреса. Текущий
   process-random tracker не заменяет отложенный распределённый abuse budget.
9. Сверить фактический egress с реестром исходящих соединений. Не включать
   provider только потому, что переменная существует.
10. Сравнить публичные утверждения с реально проверенным состоянием. Не
   публиковать цену, trial/card policy, provider/region, legal, SLA или
   certification до отдельных решений и доказательств.

## Изменение и восстановление

Обычный порядок изменения: preflight → recovery point → additive migration →
новый image → smoke/readback. Если schema ещё совместима с предыдущим image,
оператор возвращает прежний image и проверяет очереди/health. Если изменение
данных необратимо или предыдущий image несовместим, rollout не начинается без
отдельного tested recovery plan.

При межтенантной утечке, публикации не в тот канал, раскрытии token или обходе
quota затронутый путь останавливается. Доказательства сохраняются без secrets и
пользовательского контента; массовая коррекция не выполняется без плана.

## Что этот runbook намеренно не решает

- выбор инфраструктурного провайдера и региона данных;
- юридическое лицо, договоры и subprocessors;
- цена, trial/card policy и коммерческие entitlement;
- SLA, certification и формальные compliance claims;
- production deployment или подключение credentials.

Эти границы остаются задачами `content-factory-next-saas.6` и
`content-factory-next-or3.9`; до их принятия документация сообщает только
проверяемые факты текущего продукта.
