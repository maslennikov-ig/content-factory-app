# Stage Summary: content-factory-next-omx

Статус: принят локально в `work/product-events`; не влито, не опубликовано и не развёрнуто.

## Что изменилось

- Собственный `ProductEvent` и first-party receiver заменяют удалённые PostHog/Plausible следы без внешнего адреса.
- Server-owned `register` и `channel_added` нельзя подделать через клиент; `purchase` и `lifetime_claimed` пишутся только после подтверждённого успеха.
- Свойства ограничены и рекурсивно отвергают email/name/prototype keys; user/org берутся только из доверенного контекста.
- Superadmin видит выбранную когорту регистрация → первый канал, totals/latest четырёх событий и последние 50 opaque событий.
- UI доступен в 16 локалях и независимо принят после сверки с Mixpanel, Dub, Calendly и Amplitude.

## Приёмка

Focused root: 7/7 suites, 142/142. Полные task gates: 72/72 Jest suites, 640 passed, 1 skipped; Python 6/6; build трёх приложений; brand 0 unexplained / 7 allowlisted; process verification и diff check OK. Backend security/correctness review и повторный UI review — ACCEPT, P0–P3 отсутствуют.

## Границы

Schema/migration не применялись, DB/server/production не затрагивались, merge/push/deploy не выполнялись. Live PostgreSQL/Nest/browser proof остаётся future authorized integration work. Дополнительное историческое событие `cancel_subscription` вынесено в `content-factory-next-sek`.

Второй коммит ветки — ремонт по аудиту, см. `remediation.md`. Он отменяет
формулировку «atomic registration» ниже по артефактам и заменяет строку
`docs-reviewed` на следующую.

`docs-reviewed: updated - outbound-connections.md said the product has no product analytics; a new operations page records the exact ProductEvent DDL, the --allow-table step of the schema runbook, the per-organization quota and the retention window.`

`project-index: updated - added the stable repository-owned product-events API, persistence and superadmin-view entrypoint.`

`graph-reviewed: no-change-needed - the graph is stale at cda692c6; focused navigation was confirmed against current code and this unmerged branch is below the integration/release refresh boundary.`
