# Ремонт по аудиту (второй коммит ветки)

Первый коммит ветки остался как есть. Ниже — что аудит нашёл и что изменилось;
формулировки прежних артефактов, противоречащие этому файлу, отменяются им.

## Отменённые утверждения прежних артефактов

- «atomic registration» (`implementation.md`, `artifacts/backend.md`) больше не
  описывает код и перестало быть целью. Запись `register` вынесена из
  транзакции создания аккаунта: событие пишется после того, как организация
  создана, отказ записи логируется и проглатывается. Причина — схема
  применяется отдельным шагом после подъёма контейнеров, и в этом окне
  `productEvent.create` отвечает `P2021`, то есть внутри транзакции падала бы
  каждая регистрация.
- `docs-reviewed: no-change-needed` в `summary.md` было неверным.
  `docs/operations/outbound-connections.md` утверждал, что продуктовой
  аналитики нет, и в ветке не было ни строки о том, как таблица попадёт на
  боевую базу.

## Что исправлено

| Находка | Где |
| --- | --- |
| P1: `register` внутри транзакции регистрации | `libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts` |
| Троттлер считал всех через `req.ip` за общим прокси | `libraries/nestjs-libraries/src/throttler/throttler.provider.ts`, `apps/backend/src/api/routes/product-events.controller.ts` |
| Опрос оплаты перезапускался на каждый рендер | `apps/frontend/src/components/layout/check.payment.tsx` |
| Фильтр email не ловил кириллицу | `libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts` |
| Документация утверждала обратное | `docs/operations/outbound-connections.md`, новый `docs/operations/product-events-schema.md`, `docs/README.md` |
| Не было индекса под ленту последних событий | `libraries/nestjs-libraries/src/database/prisma/schema.prisma` |
| Когорта не была ограничена периодом с обеих сторон | `libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts` |
| Не было квоты на организацию и ретенции | там же, `product-events.service.ts`, `apps/commands/src/tasks/prune.product.events.ts` |
| Чтение Redis стояло вне try/catch | `apps/backend/src/api/routes/no.auth.integrations.controller.ts` |
| Мёртвый `ProductEventDto` | удалён, причина записана комментарием в `product-event.dto.ts` |
| Английские `aria-label`/`sr-only` на 15 нерусских локалях | `apps/frontend/src/components/admin/admin-product-events.component.tsx` + 3 ключа в 16 локалях |
| Два часовых пояса на одном экране | там же: весь экран в UTC, и он это подписывает |
| `crypto.subtle` только в secure context | `libraries/helpers/src/utils/use.fire.events.ts` |
| Тесты зеленели на заглушках | `tests/product-events.backend.test.cjs`, `tests/product-events.frontend.test.cjs` |

## Что не сделано намеренно

- Геометрия кнопки в `impersonate.tsx` набрана классами, как у соседей
  `ViewErrors`/`ViewStats`. Аудит сам отмечает, что это не регресс; вытаскивать
  примитив под три кнопки сразу — отдельная задача по всему блоку.
- Имена по значениям (`{ owner: 'Иван Петров' }`) по-прежнему не отвергаются:
  отличить имя от любого другого текста регулярным выражением нельзя. Ключи со
  словом `name` отвергаются, серверные события кладут пустой объект свойств.
- `apps/commands` не собирается и без этой ветки (`agent.run.ts`,
  `AgentGraphService.createGraph` отсутствует). Новая команда прунера
  компилируется, но общий build этого приложения остаётся сломанным до отдельной
  починки; поэтому ретенция на сервере описана как ограниченный `DELETE`.

## Проверки

Прицельно, из `/tmp/cf-fix/product-events`:

- `pnpm exec jest tests/product-events.backend.test.cjs tests/product-events.frontend.test.cjs` — 2 suites, 68 tests, 0 failed.
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/i18n.ui-literals.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/external-services.purge.test.cjs` — 7 suites, 75 tests, 0 failed.
- `pnpm exec jest tests/enterprise.approval.test.cjs tests/invite.signing.test.cjs tests/public.api.approval.test.cjs tests/registration.approval.test.cjs tests/telegram.auth.flow.test.cjs tests/global.validation-pipe.test.cjs tests/oauth.state.binding.test.cjs tests/telegram.connect.security.test.cjs` — 8 suites, 59 tests, 0 failed.
- `pnpm run build:backend`, `pnpm run build:frontend` — обе успешно.
- `python3 scripts/docs/check_docs.py` — 67 файлов, ссылки целы.

Красное состояние новых тестов проверено на прежних исходниках: с прежним
`organization.repository.ts` прогон падает целиком на непойманном `P2021`; с
прежним `check.payment.tsx` и `admin-product-events.component.tsx` падают три
новых фронтенд-теста.
