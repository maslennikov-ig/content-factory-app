# План: собственная рассылка с явным согласием

## Цель

Подключить Listmonk рядом с продуктом так, чтобы адрес передавался только после
явного согласия, подписка требовала подтверждения из письма, а отписка работала
по непрозрачной ссылке без ввода чужого адреса.

## Решения

- Модель эскалирована с «Терра» до «Сол»: таблица запуска называет «Терра», но
  правило того же документа требует «Сол» для любых изменений регистрации;
  специализированный прежний бриф также относит consent-flow к «Сол».
- Выбран double opt-in. Галочка по умолчанию снята и создаёт только
  неподтверждённую подписку; кампании не отправляются до клика в письме.
- Состояние подписки и подтверждение принадлежат Listmonk, поэтому новая Prisma
  таблица не нужна. Запрос уходит сразу после создания нового аккаунта и не
  зависит от последующего product approval/activation.
- Используется точный образ `listmonk/listmonk:v6.2.0`, отдельные роль и база в
  существующем PostgreSQL. Создание базы поставляется как читаемый локальный
  bootstrap и здесь не запускается.
- Встроенный Listmonk `UnsubscribeURL` остаётся границей отписки. Nginx публикует
  только `/newsletter/subscription/*` и нужные статические файлы; `/api/*` и
  `/admin/*` наружу не проходят.
- Beehiiv больше не может быть выбран: адреса не должны уходить с собственного
  сервера даже при забытом старом ключе.

## Потоки

1. LOCAL или реальный e-mail provider показывает необязательный нативный
   checkbox рядом с основным действием. Telegram/Farcaster его не показывают,
   потому что их идентификаторы не являются почтовыми адресами.
2. DTO принимает только boolean. После успешного создания нового пользователя
   backend вызывает NewsletterService ровно при `true`; сбой Listmonk не ломает
   создание аккаунта и не пишет адрес в лог.
3. Provider создаёт enabled subscriber в double-opt-in list с
   `preconfirm_subscriptions: false`, одинаковой неперсональной API-меткой
   и без welcome `/api/tx`. HTTP 409 запускает внутренний public-subscription
   recovery по UUID целевого public double-opt-in list, а не молча считается успехом.
4. Listmonk отправляет системное письмо подтверждения. После клика его публичный
   route подтверждает подписку; campaign template обязательно содержит
   `{{ UnsubscribeURL }}`.
5. Отписка происходит на встроенной странице по campaign/subscriber UUID.

## Доказательство

- Сначала focused RED для consent/UI, auth/provider и compose/bootstrap/proxy.
- Затем те же focused targets GREEN.
- Финально один root-owned release closeout: build, полный test, brand scan,
  docs, process verification и diff check на Node 22.23.2 с `TMPDIR=/tmp`.

## Technical premortem: PostgreSQL privilege boundary

Verdict: **REPLAN the database-role isolation, continue the newsletter slice
with an explicit defer.** Reversibility of this branch remains high because no
role, database, container or production configuration is applied.

Blast radius: `DATABASE_URL` is shared by backend, orchestrator and the pinned
Mastra PostgreSQL store; product schema, 29 `mastra_*` tables, functions,
triggers, backup globals/ACLs and operator rollout all depend on that identity.

| Failure symptom | Evidence / mechanism | Detection | Mitigation / disposition |
| --- | --- | --- | --- |
| App cannot start or later loses writes | confirmed: a DML-only role cannot run Mastra `PostgresStore.init()` DDL | startup logs / focused runtime smoke | do not ship a partial role; defer |
| New tables fail after an update | confirmed: runtime creates/alters tables, indexes, functions and triggers | permission errors after deploy | owner-run Mastra migrations or separate Mastra DB/role |
| New role still owns the schema | confirmed: granting CREATE/ownership would preserve the original blast radius | role/ACL preflight | reject the misleading mitigation |
| Rollback loses data | unsupported: this branch applies no DB changes | clean diff and no runtime action | code/config revert only |

Recovery after a future role rollout: before switching `DATABASE_URL`, take the
existing checked backup, provision roles owner-side, smoke startup/auth/content,
and on any permission error restore the previous URL and recreate only `cf-app`.
The role design and recovery rehearsal are tracked by
`content-factory-next-ry5.2.2`.

## Не входит

- Запуск контейнеров, создание production DB/role, SMTP, список, API token,
  reverse-proxy deployment, push, merge или deploy.
- Хранение отдельного consent audit в продуктовой БД.
- Публичный Listmonk admin/API и форма отписки по e-mail.
