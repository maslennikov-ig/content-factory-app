# Спецификация: вход через Telegram

**Статус:** `task spec`
**Проверено:** 2026-08-14 на коммите `0307be60`
**Beads:** `content-factory-next-we2` (эпик), задача входа — дочерняя

## Решение владельца

Добавить вход через Telegram. Бот у продукта уже есть, аудитория
русскоязычная, и почта для неё менее привычна, чем Telegram.

## Что показала официальная документация

Проверено по `core.telegram.org/widgets/login` и документу обнаружения
`https://oauth.telegram.org/.well-known/openid-configuration`.

**Самодельная проверка хэша по токену бота больше не нужна.** Telegram
работает как обычный провайдер OpenID Connect:

| Поле | Значение |
| --- | --- |
| `issuer` | `https://oauth.telegram.org` |
| `authorization_endpoint` | `https://oauth.telegram.org/auth` |
| `token_endpoint` | `https://oauth.telegram.org/token` |
| `jwks_uri` | `https://oauth.telegram.org/.well-known/jwks.json` |
| `response_types_supported` | `code` |
| `id_token_signing_alg_values_supported` | `RS256`, `ES256`, `EdDSA`, `ES256K` |
| `scopes_supported` | `openid`, `phone`, `profile`, `telegram:bot_access` |
| `code_challenge_methods_supported` | `plain`, `S256` |

Претензии по областям:

- `openid` — `sub`, `iss`, `iat`, `exp`
- `profile` — `id`, `name`, `preferred_username`, `picture`
- `phone` — `phone_number`
- `telegram:bot_access` — претензий не добавляет, разрешает боту писать
  пользователю в личные сообщения

Идентификатор и секрет клиента выдаёт BotFather: мини-приложение BotFather →
бот → **Login Widget**. Там же заранее вносятся **Allowed URLs** — Telegram
обработает вход только по ним.

## Три решения и их причины

1. **Никакого стороннего скрипта на странице входа.** Документация предлагает
   готовую кнопку через свою библиотеку. Поток с перенаправлением по стандарту
   OIDC даёт то же самое без чужого кода на нашей странице, а кнопку рисуем
   своей дизайн-системой. Это согласуется с ADR-0007 и с тем, что мы в этом же
   заходе убираем внешнюю загрузку шрифта.
2. **Запрашиваем только `openid` и `profile`.** Телефон продукту не нужен, а
   `telegram:bot_access` — отдельное право писать человеку в личку; его надо
   просить осознанно и тогда, когда появится сценарий.
3. **PKCE `S256`**, хотя клиент конфиденциальный и секрет есть.

## Что уже есть в коде

- Контракт провайдера: `apps/backend/src/services/auth/providers.interface.ts`
  — `generateLink(query)`, `getToken(code, redirectUri)`,
  `getUser(providerToken) → { email, id }`, декоратор
  `@AuthProvider({ provider })`, реестр `providers/providers.manager.ts`.
- **Готовый образец — `providers/oauth.provider.ts` (`GENERIC`)**: это уже
  OIDC-клиент. Telegram делается по нему.
- Ветвление существующий/новый: `services/auth/auth.service.ts:150`
  `getUserByProvider(providerUser.id, provider)`, иначе `createOrgAndUser(...)`
  в `organizations/organization.repository.ts:268`, где любой не-`LOCAL`
  провайдер создаётся сразу `activated`.
- Прецедент провайдера без почты: Farcaster и Wallet кладут `email === id` с
  префиксом (`'wallet_' + publicKey`).
- Прецедент короткоживущего хранилища: Redis в
  `providers/wallet.provider.ts:37`.
- `TELEGRAM_BOT_NAME` уже доставлен в браузер как `telegramBotName`
  (`libraries/react-shared-libraries/src/helpers/variable.context.tsx:23`).
- Разбор возврата: `components/auth/register.tsx:42-76` читает
  `?provider=&code=`.

## Работа

### Бэкенд

`TelegramProvider extends AuthProviderAbstract`,
`@AuthProvider({ provider: 'TELEGRAM' })`.

- `generateLink` — адрес `authorization_endpoint` с `response_type=code`,
  `client_id`, `redirect_uri`, `scope=openid profile`,
  `code_challenge_method=S256`, случайными `state` и `code_verifier`.
  Верификатор кладётся в Redis под ключом от `state` на короткий срок.
- `getToken(code, redirectUri)` — обмен на `token_endpoint` с
  Basic-авторизацией клиента и `code_verifier` из Redis.
- **`id_token` обязательно проверяется по JWKS**: подпись, `iss` равен
  `https://oauth.telegram.org`, `aud` равен нашему `client_id`, `exp` не истёк.
  Ключи кэшируются, неизвестный `kid` — повод обновить кэш один раз, а не
  повод пропустить проверку.
- `getUser` — `{ id: sub, email: 'telegram_' + sub }`.

Адрес возврата регистрируется как `${FRONTEND_URL}/auth?provider=TELEGRAM`.
Тогда Telegram допишет `&code=…&state=…`, существующий разбор в `register.tsx`
подхватит вход, и **`proxy.ts` править не нужно**. `state` пробрасывается до
`POST /auth/oauth/TELEGRAM/exists`, чтобы обмен нашёл свой верификатор.

Схема: значение `TELEGRAM` в enum `Provider` (`schema.prisma:989`), применение
через `pnpm run prisma-db-push` — миграций в репозитории нет.

### Фронтенд

Кнопка на `AuthProviderButton` рядом с существующими, видимая по новому флагу
окружения. Только `cf`-токены, без хекс-литералов в JSX. Все новые строки
через `t()` **и сразу во всех 16 файлах локалей**.

## Чего делать нельзя

- Сторонних скриптов Telegram на странице входа.
- Реальных вызовов Telegram в тестах и в сборке.
- Запрашивать `phone` или `telegram:bot_access`.
- Класть секрет клиента в репозиторий, в промт или в аргументы команды.
- Удалять значение `WALLET` из enum `Provider`.
- Трогать платёжную подсистему.

## Приёмка

- `pnpm run build` — код 0 под Node `22.23.2`; `pnpm test` зелёный;
  `node scripts/branding/brand-scan.cjs` — 0 unexplained; process verification.
- Тесты только на подделках: обмен кода; отказ при неверной подписи `id_token`;
  отказ при чужом `aud`; отказ при истёкшем `exp`; повторный вход находит
  существующего пользователя; первый вход создаёт организацию; отсутствие
  настроек не роняет страницу входа.
- Новые ключи присутствуют во всех 16 локалях.

## Отложено

Регистрация клиента в BotFather и внесение Allowed URLs — действие владельца.
Публичного домена у продукта нет, деплой снят со стола, и примет ли BotFather
`http://localhost:4200`, документация не говорит. Поэтому **живой вход не
входит в приёмку** и записывается как отложенный пункт.
