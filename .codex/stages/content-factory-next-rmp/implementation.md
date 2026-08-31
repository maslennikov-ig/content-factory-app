---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_id: content-factory-next-rmp
stream_owner: rmp_backend
scope_kind: product_slice
status: delivered
risk_level: high
risk_tags:
  - authentication
  - authorization
  - migration
  - transaction
verification:
  - focused Jest RED observed
  - focused backend Jest GREEN 29/29
  - Prisma format passed
  - focused backend Prettier passed
  - git diff --check passed
---

# Backend: несколько способов входа

## Реализовано

- Добавлена аддитивная `UserIdentity`: явная связь с `User`, каскадное
  удаление, глобальная уникальность provider/identifier и индекс пользователя.
- Все известные пути создания аккаунта сразу создают первую identity. Для
  `LOCAL` ключом служит email после `trim().toLowerCase()`.
- Вход ищет identity первой и временно использует legacy-поля при отсутствии
  перенесённой строки.
- Аутентифицированный `UsersController` предоставляет list/link/unlink.
  Внешняя привязка проверяется текущим provider adapter; email провайдера не
  участвует в выборе аккаунта. User id берётся только из текущей сессии.
- Link/unlink fail closed: принимается только JSON с точным origin из
  `FRONTEND_URL`, а id подписанного auth actor обязан совпадать с текущим
  пользователем. Поэтому cross-site form и impersonation не могут менять
  способы входа.
- Чужая identity не переносится. Последнюю identity удалить нельзя. Удаление
  `LOCAL` очищает пароль и при необходимости переводит primary legacy-поля на
  оставшийся способ.
- До backfill привязка также проверяет legacy-владельца внутри той же
  транзакции. Это не позволяет новой identity затенить существующий LOCAL email
  или внешний providerId, у которого ещё нет строки `UserIdentity`.
- Восстановление и смена пароля работают при добавленной `LOCAL`, даже если
  primary provider другой, и остаются совместимыми с legacy primary LOCAL до
  backfill. Mixed-case legacy email ищется case-insensitive.
- Unlink выполняется с `Serializable` и максимум тремя попытками при Prisma
  `P2034`; повтор после write conflict заново проверяет запрет последнего
  способа. При выборе LOCAL как нового primary синхронно меняются provider,
  providerId и email; конфликт уникальности откатывает всю транзакцию.
- Google и GitHub получили случайный browser-bound state с TTL 5 минут в Redis,
  одноразовым `getdel`, проверкой cookie state и привязкой к точному redirect.
- Административный обмен учётных данных меняет legacy credentials и весь набор
  identities в одной интерактивной транзакции.
- Backfill по умолчанию только строит отчёт. Apply требует maintenance window
  без auth-записей и явный `--auth-writes-disabled`, после вставки повторно
  читает все User/identity и требует чистый post-apply dry-run. Инструкция
  находится в `docs/operations/user-identity-backfill.md`.

## TDD и проверка

Первый focused запуск завершился ожидаемым RED: 2 suites, 10/10 тестов упали
из-за отсутствующих schema/model, identity lookup/link/unlink, initial identity,
backfill и транзакционного credential switch. Отдельные RED-циклы подтвердили
linked-LOCAL password reset и enterprise initial identity.

Итоговая команда:

```bash
source /home/me/.nvm/nvm.sh && nvm use 22.23.2 >/dev/null && TMPDIR=/tmp pnpm exec jest tests/user-identity.auth.test.cjs tests/user-identity.contract.test.cjs --runInBand
```

После security review отдельный RED показал возможность затенить legacy LOCAL
email и внешний providerId. Транзакционная проверка legacy-владельца закрыла
оба кейса без изменения поведения существующих duplicate identities.

Следующий review RED дал 13 ожидаемых failures: request origin/JSON/actor,
Google/GitHub state, mixed-case legacy lookup/collision, serializable P2034
retry, legacy LOCAL reset, LOCAL primary email и maintenance-safe backfill.
После минимальных правок тот же набор стал GREEN.

Результат: 2 suites passed, 29/29 tests passed. Также прошли `prisma format`,
focused backend Prettier и `git diff --check`.

## Остаточный риск

- Соединение с БД, применение схемы и backfill не выполнялись по контракту.
- Реальная PostgreSQL сериализация/P2034 и блокировка auth-трафика в maintenance
  window здесь проверены fake-клиентом и операторским контрактом, не живой БД.
- Prisma Client не генерировался в этом потоке; это должен сделать обычный
  процесс сборки после принятия схемы.
- Полная сборка и широкий набор тестов не запускались: финальная приёмка
  принадлежит корневому потоку.

---

# Frontend: способы входа

## Реализовано

- В `Settings` добавлена отдельная вкладка `Sign-in methods`. Она не вложена в
  форму профиля и владеет только состоянием identities. OAuth return с `code`
  выбирает эту вкладку до первого render, поэтому callback-компонент сразу
  монтируется, завершает link и очищает query.
- Список загружается через SWR и `useFetch`. Для каждой identity показаны
  явные `Connected`/`Available`, один `Connect` или `Remove`, loading/disabled,
  восстановимая ошибка и пустое состояние. У единственного метода `Remove`
  отключён, а причина защиты объяснена в той же строке.
- Loading повторяет геометрию двух будущих method rows restrained skeleton,
  а не заменяет поверхность строкой текста. Все статусы, действия, helper и
  accessibility labels проходят через `useT` с английскими fallbacks.
- Ниже layout breakpoint `md` новые кнопки, поля, skeleton actions и Settings
  tabs имеют target не менее 44px; длинный LOCAL identifier переносится внутри
  строки без horizontal overflow.
- Для `LOCAL` доступны email и password с проверкой email, минимальной длиной
  пароля, связанным текстом ошибки и POST только в аутентифицированный
  `/user/identities/link`.
- Внешний `Connect` запрашивает существующий `/auth/oauth/:provider` с
  `${window.location.origin}/settings`, сохраняет на пять минут provider,
  redirect URI, state и срок действия в `sessionStorage`, затем уходит в том же
  tab. Callback принимается только при живом намерении этого tab, совпавших
  origin/state и активной сессии; после POST в `/user/identities/link` intent и
  callback query очищаются, SWR обновляется. Intent снимается синхронно до
  первого сетевого ожидания, поэтому двойной effect в React Strict Mode не
  отправляет два link-запроса.
- Telegram сохраняет выбранный redirect URI рядом с PKCE verifier в
  одноразовом Redis state. Разрешены только прежний login callback и точный
  same-origin `/settings`; другой origin, путь или query отклоняются до записи
  state. Старые verifier-only записи остаются рабочими на их пятиминутный TTL.

## Сверка с Lazyweb

Выбранные материалы сохранены в приватном Agentic Search:
https://www.lazyweb.com/agentic-search/8a4544ef-e871-4025-87f2-0dff0d53e625

- Okta Security Methods (`screens:a723ce94da46466c5d49732b`): перенесена
  группировка способов в спокойные строки с названием, состоянием и действием,
  без сетки одинаковых карточек.
- Google connection control (`screens:2dd925f0143b7e88a544af2f`): состояние
  связи стоит рядом с одним прямым действием; внешние provider identifiers не
  выдаются за понятные пользователю email.
- Zapier security settings (`screens:24ecb78136b8b8e5a1d6fc03`): сохранена
  отдельная настройка в боковой навигации и плоский список без дополнительной
  вложенной навигации.
- Gusto account preferences (`screens:8663bc6bb94511a1fb8fb354`): отсутствующий
  способ обозначен прямо в строке как `Available`, а LOCAL-поля раскрыты под
  этой же строкой. В отличие от эталонов, запрет удаления последнего метода
  объяснён inline рядом с disabled-действием, потому что здесь это критичная
  защита от потери доступа.

Итог соответствует выбранному принципу: restrained inline rows, видимый
status, одно прямое действие на метод, protected removal с объяснением inline.

## TDD и проверка

Первый RED: 2 suites failed. UI suite не находил новый компонент; пять новых
Telegram проверок показывали, что `/settings` игнорируется или отклоняется и
небезопасные redirects не фильтруются. Десять прежних Telegram тестов при этом
оставались зелёными.

Отдельный edge RED воспроизвёл двойное потребление одного tab intent: второй
параллельный callback зависал на втором сетевом запросе. Синхронный claim intent
до `await` закрыл гонку.

После review выполнен ещё один focused RED тем же набором: UI suite дала четыре
ожидаемых failure — отсутствовал callback-aware initial tab, loading оставался
text-only, строки обходили `useT`, а длинный identifier и mobile controls не
имели wrap/44px contract. Telegram suite оставалась зелёной. После минимальных
UI-правок тот же набор стал GREEN.

Дополнительный локализационный RED подтвердил, что клиентская ошибка
отклонённого callback не несёт ключ для `useT`. Ошибки локальной проверки и
fallback сетевых операций теперь используют стабильный translation key перед
показом в alert; произвольный текст backend-ошибки сохраняется без подмены.

Второй UI review добавил runtime render `SettingsPopup` с callback query:
тест проверяет выбранное значение `Tabs`, смонтированный
`SignInMethodsComponent` и отсутствие global consumer, поэтому удаление wiring
`initialSettingsTab(url)` ломает наблюдаемое поведение. Общий focused RED дал
1 failure при 29 passed: sign-in controls и skeleton сбрасывали 44px уже на
`sm`, раньше layout breakpoint. После замены всех этих классов на `md` тот же
набор стал GREEN.

Итоговая команда:

```bash
source /home/me/.nvm/nvm.sh && nvm use 22.23.2 >/dev/null && TMPDIR=/tmp pnpm exec jest tests/user-identity.settings.test.cjs tests/telegram.auth.provider.test.cjs --runInBand
```

Результат после второго review: 2 suites passed, 30/30 tests passed, без warnings. Дополнительно
прошли `git diff --check` и focused Prettier check пяти изменённых файлов.

Ручная code-level проверка: структура заголовков и live/error regions,
label/description связь полей, клавиатурные native buttons/inputs, disabled и
loading labels, responsive перенос строки на узкой ширине, только `cf`-цвета и
типографические токены. Браузерный прогон не выполнялся: dev-сервер и OAuth
credentials в этом потоке не запускались.

## Остаточный риск

- Реальные provider callbacks требуют зарегистрированного `/settings` URI;
  это проверяется только интеграционно с конфигурацией конкретного провайдера.
- Light/dark, 390px и возврат из настоящего OAuth нужно подтвердить в браузере
  после запуска frontend/backend. Никаких внешних входов в этом потоке не
  инициировалось.
