# Авторизация и мультитенантность

**Статус:** `current`
**Проверено:** 2026-08-11

## Модель входа

`User.providerName` различает `LOCAL`, `GITHUB`, `GOOGLE`, `FARCASTER`, `WALLET` и `GENERIC`. Уникальность пользователя определяется парой email + provider. LOCAL позволяет зарегистрироваться без внешнего OAuth, если регистрация не отключена.

JWT передается через cookie `auth` или одноименный header. [AuthMiddleware](../../apps/backend/src/services/auth/auth.middleware.ts):

1. проверяет подпись JWT;
2. берет из токена только id и заново загружает пользователя из БД;
3. проверяет существование и `activated`;
4. загружает доступные организации;
5. выбирает организацию из `showorg` cookie/header либо первую активную;
6. помещает `user` и `org` в request context.

Это важная граница: authorization-relevant поля не считаются достоверными только потому, что находятся в старом JWT.

## Организации и роли

`UserOrganization` хранит членство, роль и disabled state. Роли Prisma: `SUPERADMIN`, `ADMIN`, `USER`. Объекты продукта должны принадлежать `Organization`, а controller получает текущую организацию через [GetOrgFromRequest](../../libraries/nestjs-libraries/src/user/org.from.request.ts).

Cookie/header `showorg` переключает текущую организацию только среди организаций пользователя. Superadmin impersonation существует как отдельный административный путь.

## Проверка возможностей

Глобальный [PoliciesGuard](../../apps/backend/src/services/auth/permissions/permissions.guard.ts) читает `@CheckPolicies` metadata и проверяет действие/раздел через PermissionsService. Ограничения включают каналы, публикации в месяц, видео, участников, AI, webhooks и admin. Нарушение subscription capability возвращает HTTP 402.

Эта проверка дополняет, но не заменяет tenant filter. У пользователя может быть право создавать посты, но он все равно не должен читать или менять объект другой организации.

## Публичные границы

Не все controllers проходят AuthMiddleware. Отдельно подключены:

- auth и activation routes;
- root/monitor routes;
- Stripe callbacks;
- provider OAuth callbacks;
- public API с собственным middleware/API key;
- OAuth authorization endpoints.

При добавлении route нужно сознательно выбрать одну из границ. Route без middleware не должен случайно полагаться на `request.org`.

## Cookie и локальная разработка

В защищенном режиме cookie выставляется с `secure`, `httpOnly` и `sameSite: none`. Для простого HTTP localhost обычно используют `NOT_SECURED=true`; это только локальная настройка и не подходит для публичной среды.

## Активация и одобрение

У пользователя есть признак `activated`, и middleware проверяет его на каждом запросе, перечитывая пользователя из базы. Он закрывает два разных сценария. Без `CONTENT_FACTORY_REQUIRE_APPROVAL` работает унаследованная схема: LOCAL-регистрация ждёт письма со ссылкой активации, а при отсутствии почтового провайдера активируется сразу. С `CONTENT_FACTORY_REQUIRE_APPROVAL="true"` любая регистрация, включая федеративную, создаёт неактивный аккаунт, самостоятельная активация отключена, а включить аккаунт может только администратор через `/admin/users`. Решение принимает одна чистая функция [`resolveNewUserAccess`](../../libraries/helpers/src/auth/registration.approval.ts), чтобы правила не разъезжались между слоями.

Исключения для первой организации больше нет. `resolveNewUserAccess` возвращает `isSuperAdmin: false` на каждой ветке, поэтому первый зарегистрировавшийся не получает прав инстанса: на публичном инстансе первым регистрируется не владелец. Администраторский аккаунт создаёт оператор до открытия публичного трафика — [Bootstrap администратора инстанса](../operations/production-deploy.md#bootstrap-администратора-инстанса).

Роль `Role.SUPERADMIN` в `UserOrganization` — другое право и остаётся у каждого самостоятельно зарегистрировавшегося человека в его собственной организации: он её владелец. Операторских возможностей инстанса (`/admin/users`, announcements, billing-администрирование, impersonation) она не даёт — их проверяет только флаг `User.isSuperAdmin`.

Google login не является способом «без настройки» войти локально. Текущий [GoogleProvider](../../apps/backend/src/services/auth/providers/google.provider.ts) использует `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`, а default redirect строит как `${FRONTEND_URL}/integrations/social/youtube`. Этот точный URI должен быть разрешен в Google OAuth client. Для первого просмотра продукта используйте LOCAL регистрацию при `DISABLE_REGISTRATION=false`; при отсутствии Resend пользователь активируется автоматически согласно `.env.example`.

Telegram login реализован отдельным [TelegramProvider](../../apps/backend/src/services/auth/providers/telegram.provider.ts): authorization code с PKCE `S256`, одноразовый `state` в Redis и проверка `id_token` по JWKS, issuer, audience и сроку действия. Точный callback — `${FRONTEND_URL}/auth?provider=TELEGRAM`; кнопка скрыта без `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`. Это не тот же credential, что `TELEGRAM_TOKEN` для публикации в каналы.

`state` привязан к браузеру. `GET /auth/oauth/:provider` зеркалит `state` из ссылки авторизации в cookie `oauth_state` (HttpOnly, Secure, `SameSite=None`, пять минут), а `POST /auth/oauth/:provider/exists` передаёт её провайдеру вместе со `state` из URL. `TelegramProvider` отклоняет обмен при несовпадении, чем закрывает логин-CSRF: чужие `code` и `state`, подсунутые в браузер жертвы, приходят без нужной cookie. Провайдеры без `state` в ссылке cookie не получают и работают как раньше. Включение описано в [Подготовке входа через Telegram](../operations/telegram-login-setup.md).

## Требования к новым доменам Content Factory

- все корневые queries принимают `orgId` из server request context, а не из доверенного body;
- foreign keys не должны позволять связать объекты разных организаций;
- роли для редактора/согласующего проектируются поверх tenant membership, а не вместо него;
- audit record хранит actor id и organization id;
- public/share links получают отдельную минимальную capability, срок и отзыв;
- prompts, sources и generated content считаются чувствительными пользовательскими данными, даже если не содержат OAuth secrets.
