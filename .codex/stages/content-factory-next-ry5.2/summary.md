# Stage Summary: own newsletter with explicit consent

## Goal

Подключить рассылку к собственному Listmonk без молчаливой подписки,
выноса адресов во внешний сервис и отписки по чужому e-mail.

## Accepted boundary

- Нативная необязательная галочка рядом с основным действием;
  default `false`, сброс при потере подходящего e-mail, все 16 локалей.
- LOCAL и e-mail providers могут показать consent; синтетические
  Telegram/Farcaster identity никогда не отправляются в рассылку.
- Backend вызывает Listmonk только после создания нового аккаунта и
  только при `true`; activation и returning login не подписывают.
- Listmonk `v6.2.0` закреплён в private Compose без host port, с отдельной
  ролью/базой, double opt-in, least-privilege API token и без Beehiiv.
- Nginx публикует только UUID confirmation/unsubscribe и статику;
  admin, API, e-mail form, export и wipe отвечают 404.
- Опциональная Listmonk DB включена в checksum/manifest backup, restore,
  collision guards и writer quiescing; прежний backup без Listmonk совместим.

## Reference comparison

- CarbonChain: отдельный unchecked consent у CTA; Content Factory повторяет
  структуру в своёй auth-shell с CF tokens.
- iManage: только уже введённый адрес; ни имя, ни второй e-mail не
  собираются. Требуемое API поле `name` заполнено одинаковой
  неперсональной меткой.
- The Pattern: нейтральный одношаговый unsubscribe; его даёт встроенная
  Listmonk UUID страница без поиска адреса.

Stable private evidence:
https://www.lazyweb.com/agentic-search/fa8814a4-2de6-41ee-938f-2e291169f682

## Verification

- Backend/infra focused acceptance: 8 suites, 126/126.
- UI/design/locale focused acceptance after review correction: 8 suites, 61/61.
- Independent accessibility review: ACCEPT.
- Independent accessibility, security and correctness reviews: ACCEPT.
- Canonical release acceptance: all application builds; 75/75 Jest suites,
  695/695 tests and 6/6 Python; brand scan 0 unexplained / 7 allowlisted;
  docs 68; process verification and diff check. Exact receipt:
  `acceptance-receipt.json`.

## Defers

- `content-factory-next-ry5.2.1`: durable retry для consented subscription
  после временного отказа внутреннего Listmonk.
- `content-factory-next-ry5.2.2`: отдельная non-owner runtime роль product DB
  после выноса Mastra runtime DDL в owner-run migrations или отдельную DB/role.
- Запуск DB/bootstrap/container/SMTP/list/token/campaign/backup proof остаётся
  owner-only deployment work and was not performed.

docs-reviewed: updated - added the newsletter runbook, environment, proxy, backup and deployment contract; corrected one pre-existing broken design-document link required by the release gate.

graph-reviewed: blocked - this branch has no graphify-out artifact; direct source mapping and focused tests were used without external Graphify backends or refresh.

## Closeout

- Branch: `work/newsletter-subscription` from `main` `04f9f6d7`.
- Commit model: Сол (registration/auth escalation over the table's Терра default).
- No push, merge, deploy, server/SSH, production database, container, SMTP or
  real-user message.
