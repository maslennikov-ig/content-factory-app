# Паспорт проекта и голос бренда

**Статус:** accepted contract + implemented first vertical slice

**Стадия:** `content-factory-next-9e9`

**Задача:** `content-factory-next-9e9.2`

**Покрывает:** `AC-2`, профильную часть `AC-3` и контракт версии для `AC-7`

**Проверено по репозиторию:** 2026-08-20

## 1. Результат и границы

Организация получает один паспорт проекта с версионируемым голосом бренда.
Администратор вручную создаёт черновик, проверяет его детерминированными
правилами, редактирует и активирует. Участник видит и применяет опубликованную
версию в генераторе, редакторе, агенте и AutoPost. Каждая созданная заготовка
показывает выбранную версию или явный нейтральный fallback.

Первая реализация обязана работать без модельного вызова. Будущее заполнение с
помощью AI будет отдельным явным действием, создающим только предложенный
черновик. Оно не входит в эту стадию и не разрешает credentials, live/paid call
или скрытое переключение между `included` и `workspace_key`.

Не входят:

- автоматическое извлечение профиля из сайта, документов, старых публикаций или
  внешних источников;
- доказательство фактов и свежести: это граница реестра источников и памяти;
- юридическая проверка claims, disclaimers или прав на пользовательские примеры;
- live-публикация, подключение реальных каналов, deploy и production-миграция;
- изменение существующего Temporal workflow/activity AutoPost;
- новая ролевая модель редактора и согласующего.

## 2. Подтверждённая текущая граница

### 2.1 Tenancy и права

- Текущая организация выбирается только из членств пользователя и помещается в
  request context. DTO не должен принимать доверенный `organizationId`:
  [`auth.middleware.ts`](../../apps/backend/src/services/auth/auth.middleware.ts)
  и [`org.from.request.ts`](../../libraries/nestjs-libraries/src/user/org.from.request.ts).
- Членство `UserOrganization` имеет роли `SUPERADMIN`, `ADMIN`, `USER` и
  `disabled`. Все продуктовые записи должны принадлежать `Organization`:
  [`auth-and-tenancy.md`](../architecture/auth-and-tenancy.md) и
  [`schema.prisma`](../../libraries/nestjs-libraries/src/database/prisma/schema.prisma).
- Существующий безопасный образец организационной настройки — AI settings:
  чтение и мутации берут организацию из request и защищены
  `Sections.ADMIN` в
  [`settings.controller.ts`](../../apps/backend/src/api/routes/settings.controller.ts).
- `PoliciesGuard` проверяет capability/role, но не заменяет tenant filter. Каждая
  repository-операция профиля всё равно обязана включать `organizationId`.

### 2.2 Четыре потребителя

- Generator сейчас получает свободный запрос, язык, формат и грубый выбор
  `personal/company`; профиль и версия отсутствуют. Один streaming admission
  идёт как операция `agent`:
  [`generator.dto.ts`](../../libraries/nestjs-libraries/src/dtos/generator/generator.dto.ts),
  [`generator.tsx`](../../apps/frontend/src/components/launches/generator/generator.tsx) и
  [`agent.graph.service.ts`](../../libraries/nestjs-libraries/src/agent/agent.graph.service.ts).
- Editor хранит ручной текст и имеет явные Copilot/research actions. Само
  редактирование не требует AI:
  [`editor.tsx`](../../apps/frontend/src/components/new-launch/editor.tsx).
- Agent передаёт в backend выбранные каналы и язык, но не профиль. Модель
  разрешается по организации на каждый запрос:
  [`agent.chat.tsx`](../../apps/frontend/src/components/agents/agent.chat.tsx),
  [`copilot.controller.ts`](../../apps/backend/src/api/routes/copilot.controller.ts) и
  [`load.tools.service.ts`](../../libraries/nestjs-libraries/src/chat/load.tools.service.ts).
- AutoPost принадлежит организации, хранит язык и собственный prompt/content,
  а AI-ветка уже обёрнута в операцию `autopost`. Текущий Temporal workflow
  бесконечный и запускает публикационный activity только по `id`; менять его
  контракт нельзя:
  [`autopost.service.ts`](../../libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts),
  [`autopost.workflow.ts`](../../apps/orchestrator/src/workflows/autopost.workflow.ts) и
  [`autopost.dto.ts`](../../libraries/nestjs-libraries/src/dtos/autopost/autopost.dto.ts).

### 2.3 AI admission

`AiUsageService` создаёт tenant-scoped admission до provider call. Режим
`workspace_key` использует только ключ организации; `included` — только
серверный ключ и квоту. Отсутствующий ключ, исчерпанная квота и contention
закрываются без скрытого fallback. Вложенный вызов в активном AI context не
создаёт вторую продуктовую операцию:
[`ai.provider.config.ts`](../../libraries/nestjs-libraries/src/openai/ai.provider.config.ts)
и [`ai.usage.service.ts`](../../libraries/nestjs-libraries/src/openai/ai.usage.service.ts).

Следствие: ручное сохранение профиля не проходит через `AiUsageService` вообще.
Будущий assist обязан проходить через него; прямое создание AI client запрещено.

## 3. Принятые продуктовые решения

### 3.1 Владение и права

Профиль принадлежит организации, не пользователю. Один пользователь видит один
и тот же active pointer во всех сессиях этой организации.
`SUPERADMIN` ниже означает роль членства `UserOrganization`, а не операторский
флаг инстанса `User.isSuperAdmin`.

| Действие                                           | `USER` | `ADMIN` / `SUPERADMIN` | Защита                              |
| -------------------------------------------------- | ------ | ---------------------- | ----------------------------------- |
| Видеть active и опубликованные версии              | да     | да                     | auth + tenant filter                |
| Применить опубликованную версию к своей заготовке  | да     | да                     | consumer permission + tenant filter |
| Создать/изменить черновик профиля                  | нет    | да                     | `Sections.ADMIN`                    |
| Активировать, выбрать старую опубликованную версию | нет    | да                     | `Sections.ADMIN` + transaction      |
| Деактивировать/восстановить профиль                | нет    | да                     | `Sections.ADMIN` + dependency check |
| Запустить будущий AI-assist                        | нет    | да                     | `Sections.ADMIN` + AI admission     |

Выбор опубликованной версии для одной заготовки не даёт права менять профиль.
Права на саму заготовку остаются у её consumer-сценария. Текущая модель не имеет
отдельных ролей «редактор» или «согласующий», поэтому изобретать их в этом срезе
нельзя.

### 3.2 Версии и lifecycle

У организации один стабильный контейнер `ProjectBrandProfile` и сколько угодно
версий `ProjectBrandProfileVersion`.

1. Первый save создаёт изменяемый `DRAFT` с `revision = 1`.
2. Повторный save требует `expectedRevision`; конкурентное изменение даёт
   `409`, не перетирая чужую работу.
3. Проверка черновика локальна и детерминирована. Она не вызывает модель.
4. Activation атомарно переводит версию в `PUBLISHED`, делает её immutable,
   двигает `activeVersionId` и пишет audit event.
5. «Редактировать активную» всегда клонирует её в новый draft с
   `parentVersionId`. Опубликованный snapshot не меняется.
6. Любую опубликованную версию можно снова выбрать active. Версии с уже
   созданными результатами не удаляются физически.
7. Пользовательское «Удалить профиль» означает деактивацию: active pointer
   очищается, контейнер получает `deletedAt`, а история остаётся для provenance
   и аудита. Восстановление создаёт новый draft или выбирает сохранённую
   опубликованную версию явным действием администратора.

Статус в интерфейсе вычисляется без двусмысленности:

- `Черновик` — lifecycle `DRAFT`, никогда не используется runtime;
- `Активна` — `PUBLISHED` и id совпадает с `activeVersionId`;
- `Опубликована` — immutable версия, сейчас не active;
- `Архив` — версия скрыта из обычного выбора, но доступна в истории.

### 3.3 Выбор версии в consumer-запросе

Новый контракт не полагается на отсутствие поля. Клиент отправляет одну из
трёх явных стратегий:

```ts
type BrandProfileSelectionV1 =
  | { mode: 'active' }
  | { mode: 'version'; versionId: string }
  | { mode: 'none' };
```

- Новый UI по умолчанию выбирает `active` и показывает resolved label до
  действия.
- `version` принимает только опубликованную версию той же организации.
- `none` — сознательный нейтральный режим.
- Legacy request без поля сохраняет прежнее поведение и считается `none`; это
  не даёт незаметно изменить старый API-клиент после появления active profile.
- Явно запрошенная отсутствующая, чужая, draft или деактивированная версия даёт
  `409 BRAND_PROFILE_VERSION_UNAVAILABLE` до AI admission. Переключения на
  active/другую версию нет.

AutoPost — отдельный случай: при сохранении нового draft-only правила стратегия
`active` разрешается один раз и в записи закрепляется конкретный опубликованный
`brandProfileVersionId`. Последующая смена active не меняет уже настроенный
AutoPost.

## 4. Модель данных

Имена — предлагаемый публичный контракт реализации; root synthesis может
уточнить их до первой миграции, не меняя инварианты.

### 4.1 `ProjectBrandProfile`

| Поле                     | Тип                | Правило                               |
| ------------------------ | ------------------ | ------------------------------------- |
| `id`                     | string             | стабильный id контейнера              |
| `organizationId`         | string, unique     | один профиль на организацию           |
| `activeVersionId`        | string, nullable   | только `PUBLISHED` той же организации |
| `createdAt`, `updatedAt` | datetime           | server-owned                          |
| `deletedAt`              | datetime, nullable | деактивация, не hard delete           |

### 4.2 `ProjectBrandProfileVersion`

| Поле                                 | Тип              | Правило                                        |
| ------------------------------------ | ---------------- | ---------------------------------------------- |
| `id`                                 | string           | version id для выбора/provenance               |
| `organizationId`                     | string           | прямой tenant filter и composite integrity     |
| `profileId`                          | string           | тот же tenant, cascade только при удалении org |
| `versionNumber`                      | integer          | монотонный внутри profile, unique              |
| `parentVersionId`                    | string, nullable | версия, из которой клонировали draft           |
| `schemaVersion`                      | integer          | для первого payload равно `1`                  |
| `lifecycle`                          | enum             | `DRAFT`, `PUBLISHED`, `ARCHIVED`               |
| `label`                              | string, nullable | короткая человеческая подпись, не identity     |
| `content`                            | JSON             | полный валидированный `BrandProfileContentV1`  |
| `contentDigest`                      | string           | SHA-256 canonical JSON, server-owned           |
| `revision`                           | integer          | optimistic concurrency только draft            |
| `createdByUserId`, `updatedByUserId` | string           | actor в tenant membership                      |
| `publishedByUserId`, `publishedAt`   | nullable         | заполнены при первой activation                |
| `createdAt`, `updatedAt`             | datetime         | server-owned                                   |

`organizationId` дублируется намеренно: repository может фильтровать любую
версию напрямую, а composite relation не позволяет связать profile и version
разных организаций. Все ID из body рассматриваются только как lookup key вместе
с `request.org.id`.

### 4.3 `BrandProfileAuditEvent`

Не использовать `ProductEvent` как audit log: его назначение — продуктовая
аналитика, а properties ограничены и имеют другой retention/доступ.

Audit event неизменяем и содержит:

- `id`, `organizationId`, `profileId`, `versionId?`, `actorUserId?`;
- действие `DRAFT_CREATED`, `DRAFT_UPDATED`, `VERSION_ACTIVATED`,
  `VERSION_SELECTED`, `VERSION_ARCHIVED`, `PROFILE_DEACTIVATED`,
  `PROFILE_RESTORED`, `AUTOPOST_PAUSED`;
- `fromVersionId?`, `toVersionId?`, `revision?`, `contentDigest?`, `createdAt`.

Полный content, prompt, output и секреты в audit не дублируются. Запись версии,
active pointer и audit event входят в одну Prisma transaction. Повторная
activation уже active версии — idempotent no-op без второго события.

### 4.4 `BrandProfileContentV1`

Payload сохраняется целиком, а не набором непроверяемых partial patches:

```ts
interface BrandProfileContentV1 {
  project: {
    name: string;
    oneLineDescription: string;
    mission?: string;
    offerings: string[];
    audiences: Array<{ name: string; need?: string }>;
    positioning?: string;
    contentGoals: string[];
  };
  voice: {
    defaultLanguage: 'ru' | 'en';
    allowedLanguages: Array<'ru' | 'en'>;
    traits: Array<{ name: string; guidance: string }>;
    pointOfView: 'first_person' | 'company_we' | 'third_person';
    formality: 'conversational' | 'neutral' | 'formal';
    sentenceStyle?: string;
    ctaStyle?: string;
    emojiPolicy: 'none' | 'restrained' | 'allowed';
    hashtagPolicy: 'none' | 'restrained' | 'allowed';
  };
  lexicon: {
    preferred: Array<{ term: string; guidance?: string }>;
    avoid: Array<{ term: string; replacement?: string; reason?: string }>;
  };
  guardrails: {
    prohibitedTopics: string[];
    prohibitedClaims: string[];
    requiredPhrases: string[];
  };
  examples: Array<{
    kind: 'on_brand' | 'off_brand';
    text: string;
    explanation?: string;
    platform?: string;
  }>;
  platformOverrides: Array<PlatformVoiceOverrideV1>;
}
```

Паспорт хранит identity, positioning и правила речи. Проверяемые утверждения,
цены, даты, метрики и evidence не копируются сюда как «истина»; ими владеет
fact-memory contract. `prohibitedClaims` — запрет формулировок, не база фактов.

Минимум для activation:

- непустые `project.name`, `oneLineDescription`, хотя бы один audience и goal;
- `defaultLanguage` входит в `allowedLanguages`;
- от одного до пяти traits с guidance;
- нет одинакового нормализованного термина одновременно в `preferred` и
  `avoid`;
- лимиты длины/числа элементов соблюдены;
- platform override ссылается на известный provider identifier организации или
  на поддерживаемый canonical provider slug.

Начальные server-side пределы не дают профилю стать неограниченным prompt или
payload: canonical JSON не больше 64 KiB; `name` до 120 символов; длинные
описания/guidance до 1 000; до 20 offerings, audiences и goals; до пяти traits;
до 100 preferred/avoid terms суммарно; до 50 элементов в каждом guardrail
списке; до 20 examples по 2 000 символов; не больше одного override на provider.
Центральный renderer также проверяет максимум 16 000 символов prompt fragment
при activation. Превышение даёт `422`; запрещено молча обрезать запреты или
examples и менять смысл published snapshot.

Примеры — только образцы стиля. Они не считаются factual evidence, не должны
копироваться дословно и не могут отменять provider/product safety. UI просит
пользователя добавлять только материал, который он вправе использовать.

## 5. Platform overrides

Отдельные профили на каждую площадку отклонены: они быстро расходятся и скрывают
общую идентичность. Версия содержит общую основу и узкие overrides:

```ts
interface PlatformVoiceOverrideV1 {
  provider: string;
  traits?: Array<{ name: string; guidance: string }>;
  pointOfView?: 'first_person' | 'company_we' | 'third_person';
  formality?: 'conversational' | 'neutral' | 'formal';
  sentenceStyle?: string;
  ctaStyle?: string;
  emojiPolicy?: 'none' | 'restrained' | 'allowed';
  hashtagPolicy?: 'none' | 'restrained' | 'allowed';
  preferredAdd?: Array<{ term: string; guidance?: string }>;
  avoidAdd?: Array<{ term: string; replacement?: string; reason?: string }>;
  prohibitedTopicsAdd?: string[];
  prohibitedClaimsAdd?: string[];
  requiredPhrasesAdd?: string[];
  examples?: Array<{ kind: 'on_brand' | 'off_brand'; text: string }>;
}
```

Порядок разрешения фиксирован:

1. Product safety и provider constraints имеют высший приоритет и живут в
   соответствующих provider implementations.
2. Глобальные и platform-specific запреты/required phrases объединяются;
   override не может ослабить глобальный запрет.
3. Platform style заменяет только перечисленные style fields.
4. Неуказанные поля наследуются из общей версии.

Generic brand resolver не знает лимиты X, LinkedIn или Telegram и не переносит
provider-specific поведение из реализаций провайдеров. Он принимает canonical
provider identifier, возвращает эффективный voice snapshot и список warnings.

Для multi-platform generation нельзя скрывать дополнительные provider calls.
Первый срез группирует цели с одинаковым effective context; отдельная группа
проходит отдельный AI admission либо пользователь выбирает один target. Точное
число provider calls нельзя обещать, пока открыт `content-factory-next-saas.5`.

## 6. Общий runtime-контракт

Один `BrandProfileContextService` разрешает версию до любого prompt/model call:

```ts
interface ResolvedBrandProfileContextV1 {
  schemaVersion: 'brand-profile-context/v1';
  selection: 'active' | 'explicit' | 'none' | 'legacy_none';
  applied:
    | {
        mode: 'profile';
        profileId: string;
        versionId: string;
        versionNumber: number;
        label: string;
        contentDigest: string;
        provider?: string;
      }
    | {
        mode: 'neutral_fallback';
        reason: 'no_active_profile' | 'explicit_none' | 'legacy_request';
      };
  effectiveVoice?: object;
  warnings: string[];
}
```

Правила:

- resolver получает `organizationId` только из server context или
  tenant-owned AutoPost row;
- draft никогда не разрешается runtime;
- полный profile content не принимается от frontend при generation;
- prompt fragment строится централизованно из resolved snapshot;
- brand examples отделяются delimiter и объявляются стилевыми образцами, а не
  фактами или инструкциями обхода safety;
- result provenance хранит `versionId`, `versionNumber`, `label`, digest и
  fallback reason; одной UI-плашки без сохранения недостаточно;
- immutable version + digest дают воспроизводимость без копии чувствительного
  профиля в каждом Post;
- деактивированный профиль остаётся доступен только для чтения исторического
  provenance, но не для новых generation requests.

### 6.1 Generator

- Новый UI показывает «Голос: vN · Активна», selector опубликованных версий и
  «Без профиля · нейтральный стиль».
- Legacy `tone: personal/company` действует только для legacy/`none` request.
  При profile selection новый UI его не отправляет; backend отвергает
  конфликтующие новые поля, чтобы приоритет не был скрытым.
- Target integration IDs отправляются явно; backend сам разрешает их provider
  identifiers внутри организации.
- Resolved context входит в state до узлов prompt и возвращается вместе с
  streaming result. Generator graph разрешает версию ровно один раз server-side
  до начала graph/model; все узлы используют тот же immutable snapshot. При
  ошибке версии stream/model ещё не начаты.
- Открытый в editor результат сохраняет provenance при создании draft.

### 6.2 Editor

- Ручной ввод, save и brand check не вызывают модель.
- Панель показывает выбранную версию, ключевые traits, запреты и effective
  platform override для текущего канала.
- Детерминированная проверка ловит запрещённые термины, required phrases и
  известные конфликты. Она не заявляет, что «измерила тон» без модели.
- Launch/editor store несёт только immutable version id и display summary;
  backend повторно проверяет id вместе с organization при save и сохраняет exact
  resolved version в provenance. Клиентский snapshot не является authority.
- Явные Copilot actions получают ту же selection; ручная заготовка остаётся
  доступной при отсутствии AI credentials/quota.
- Перед save пользователь видит warnings. Hard provider validation остаётся в
  существующем server-side Posts validation.

### 6.3 Agent

- Selector и label находятся рядом с language/channel context и передаются в
  Copilot properties.
- Backend разрешает version и кладёт только server-resolved context в
  `RequestContext`; браузер не задаёт prompt fragment. Resolution выполняется на
  каждый request, потому что Mastra agent/tools — singleton и не могут хранить
  tenant/profile state между организациями.
- Любой draft, созданный tool call, получает то же provenance. Агент не может
  сам незаметно выбрать другую версию.
- Подтверждение пользователя и draft-only граница имеют приоритет над brand
  instructions.

### 6.4 AutoPost

- Новый AutoPost pin-ит опубликованный `brandProfileVersionId`; текущий active
  показывается только как предлагаемый default на форме.
- Legacy rows получают `brandProfileVersionId = null` и продолжают без профиля;
  автоматического backfill из нового active нет.
- Добавление profile/version в текущий `autoPostWorkflow` или activity
  запрещено. Нужны versioned `autoPostDraftWorkflowV2` и activity V2.
- V2 получает стабильный AutoPost id/version selection, разрешает tenant-owned
  context и заканчивается созданием `DRAFT`. Live publish не вызывается.
- Созданный Post сохраняет exact resolved version id/digest, а не только
  AutoPost config pointer: это защищает provenance от последующего изменения
  самого правила.
- Если pinned version деактивирована/недоступна, правило до AI admission
  переходит в явное `requires_attention`/paused state. Оно не использует active,
  neutral fallback или старый prompt скрытно.
- Деактивация профиля в одной transaction помечает зависимые V2 rules для
  паузы; завершение/остановка workflow выполняется идемпотентным side effect с
  reconciler. Если атомарная смена состояния ещё не реализована, API
  деактивации отвечает conflict и перечисляет зависимости вместо частичного
  удаления.

## 7. Пользовательский путь

Профиль находится в административной группе настроек, но опубликованный summary
доступен read-only из рабочих сценариев.

1. Empty state: «Профиль ещё не настроен. Контент создаётся в нейтральном
   стиле». Единственное основное действие администратора — «Создать вручную».
2. Step «Проект»: имя, краткое описание, offerings, audience, positioning,
   goals. Save создаёт draft без AI.
3. Step «Голос»: язык, traits, лицо речи, formal/neutral/conversational,
   sentence/CTA/emoji/hashtag policies.
4. Step «Лексика и границы»: preferred, avoid/replacements, запрещённые темы и
   claims, required phrases.
5. Step «Примеры и площадки»: on/off-brand examples и узкие platform overrides.
6. Review: completeness checklist, effective summary, конфликты и список
   площадок. «Активировать vN» — отдельное подтверждаемое действие.
7. После activation UI показывает actor/date, active badge и действия
   «Создать новую версию», «Выбрать опубликованную», «Деактивировать».
8. В consumer UI выбранная версия видна до generation/edit и у результата.

Draft autosave допустим только как обычный backend save с revision. Local-only
несохранённый текст можно держать в форме, но нельзя показывать как сохранённый.
UI покрывает loading, empty, default, saved, validation error, permission
restriction, conflict, unavailable version, disabled и длинные RU/EN строки.
Реализация следует `cf` tokens, обеим темам и ширинам 1440/1024/768/390.

## 8. Incomplete и fallback

| Состояние                            | Runtime                            | Что видит пользователь                       |
| ------------------------------------ | ---------------------------------- | -------------------------------------------- |
| Профиля нет                          | neutral fallback                   | «Без профиля · нейтральный стиль»            |
| Есть только incomplete draft         | neutral fallback                   | draft «Не используется», список недостающего |
| Есть active и incomplete draft       | остаётся active                    | active label + draft «Не используется»       |
| `mode:none`                          | neutral fallback                   | явный выбор пользователя                     |
| Explicit version чужая/missing/draft | block `409` до model               | «Версия недоступна, выберите снова»          |
| Active удалён между review и submit  | block `409` для явного resolved id | refresh выбора, без fallback                 |
| AutoPost pinned version недоступна   | pause/requires attention           | причина и действие «Выбрать версию»          |

Нейтральный fallback содержит только общие platform-safe инструкции и язык,
выбранный пользователем. Он не выводит positioning из `Organization.description`,
не копирует старые Posts и не выдумывает «обычный голос бренда».

## 9. Zero-model manual path и будущий assist

Ручной путь включает create/update/validate/review/activate/select/deactivate и
не импортирует AI clients, не пишет `AiUsageRecord` и не проверяет наличие
ключа. В UI профиля используются обычные fields, не Copilot textarea с
автоматическими suggestions.

Если позже будет принят AI-assist:

1. Он запускается только отдельной кнопкой администратора после объяснения, что
   будет проанализировано.
2. Backend вызывает
   `AiUsageService.executeAiOperation(orgId, 'brand_profile_assist', ...)`;
   `brand_profile_assist` добавляется как отдельный `AiOperation` для
   наблюдаемости, без новой billing-семантики.
3. `included` расходует admission попытки по текущим правилам;
   `workspace_key` использует только ключ организации. Missing key/quota/
   contention возвращают текущие ошибки, без перехода в другой режим.
4. Результат — новый `DRAFT` с пометкой происхождения `ai_assisted`; он не
   активируется автоматически и не перезаписывает ручной draft.
5. Samples считаются пользовательскими данными; prompt/output не попадают в
   `AiUsageRecord` или audit event.
6. Page load, save, blur, validation и activation никогда не запускают assist.

В этой research-стадии модельные вызовы не выполнялись и не разрешены.

## 10. Миграция и rollback

### Expand

- Добавить новые profile/version/audit tables Prisma migration; raw SQL и
  `prisma db push` не использовать.
- Добавить nullable provenance/profile references и nullable
  `brandProfileVersionId`/workflow-version поля AutoPost только после root
  synthesis с source/memory contracts.
- Migration проходит `prisma migrate diff` guard по процедуре
  `docs/operations/production-deploy.md`.
- Существующие организации получают ноль profile rows. Нет генерации данных,
  backfill из `Organization.description`, `User.agent`, `Sets`, `Signatures`,
  Posts, AutoPost content или donor.

### Adopt

- Сначала API и ручной admin UI; затем shared resolver/provenance; затем четыре
  consumers.
- Legacy consumer request без selection остаётся `legacy_none`.
- Existing AutoPost rows остаются legacy V1 без profile. Перевод в V2 — явное
  редактирование/подтверждение, не автоматическое включение.
- Новые writes пишут version/provenance; старые Posts читаются как
  `legacy/no profile metadata`.

### Rollback

- До activation feature flag скрывает новые routes/UI; schema additive.
- Откат приложения не требует удаления таблиц/колонок: старый код их игнорирует.
- V2 AutoPost rules не переводятся обратно в публикационный V1 автоматически;
  их останавливают и оставляют reviewable draft/history.
- Удалять schema можно только отдельной будущей destructive migration после
  доказательства отсутствия readers; текущий rollback сохраняет данные.

## 11. Acceptance matrix

| ID    | Сценарий                                                      | Проверяемый результат                                                             | Уровень                 |
| ----- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| BP-01 | ADMIN создаёт и сохраняет incomplete draft без AI config      | draft/revision/audit записаны, active пуст, `AiUsageRecord` не создан             | backend integration     |
| BP-02 | USER читает profile и пробует изменить                        | read разрешён; mutation `403`, данных другой org нет                              | controller/permission   |
| BP-03 | Запрос version id другой организации                          | `404/409`, ни content, ни existence не раскрыты                                   | repository/security     |
| BP-04 | Два save одного revision                                      | один успешен, второй `409`, нет lost update                                       | transaction/concurrency |
| BP-05 | Activation incomplete/конфликтного draft                      | `422`, active и audit не изменены                                                 | service                 |
| BP-06 | Activation valid draft                                        | immutable published version, active pointer и audit атомарны                      | service/integration     |
| BP-07 | Редактирование active                                         | создаётся clone draft; старый digest/content неизменны                            | service                 |
| BP-08 | Выбор старой published версии                                 | active pointer меняется, history/result references сохраняются                    | service                 |
| BP-09 | Нет profile / только incomplete draft                         | все четыре UI показывают neutral fallback, prompt не выдумывает brand voice       | consumer contract       |
| BP-10 | Explicit missing/draft/deactivated version                    | `409` до AI admission; AutoPost paused                                            | integration/failure     |
| BP-11 | Global avoid + platform override                              | запреты объединены, style override применён, provider rules выше                  | resolver unit           |
| BP-12 | Generator normal path                                         | label виден до/после; stream и созданный draft несут тот же version/digest        | integration/UI          |
| BP-13 | Editor manual path                                            | brand guidance/lint работают без network/model; draft provenance сохранён         | integration/UI          |
| BP-14 | Agent создаёт draft                                           | server-resolved context совпадает с visible selector и tool provenance            | integration/UI          |
| BP-15 | AutoPost V2 active сменился после настройки                   | правило продолжает pinned version, создаёт только draft                           | Temporal integration    |
| BP-16 | Profile деактивируют при AutoPost dependency                  | dependency paused/reconciled либо операция целиком blocked; скрытого context нет  | failure/recovery        |
| BP-17 | `included` quota exhausted / `workspace_key` missing          | текущая AI ошибка, no provider call, no cross-mode fallback; manual path работает | AI admission            |
| BP-18 | Research/source unavailable                                   | brand context остаётся, но не становится factual evidence и не обещает свежесть   | shared context edge     |
| BP-19 | UI states RU/EN, light/dark, 1440/1024/768/390, keyboard/200% | обязательные действия и version label доступны без overflow                       | browser/root            |
| BP-20 | Legacy Post/AutoPost/request                                  | читается как legacy/no-profile; no backfill, no surprise activation               | migration               |

Focused TDD обязателен для observable behavior, state transitions, tenant
filters, AI failure-before-call и versioned Temporal path. Broad build/test —
только единая корневая acceptance стадии.

## 12. Поэтапная implementation map

### Фаза A — data и ручной административный контракт

Один cohesive task: Prisma models/migration, DTO → Controller → Service →
Repository, admin permissions, optimistic draft saves, activation/deactivation,
audit и focused tenant/state tests. Public facade — `/brand-profile` API. Никаких
AI imports.

### Фаза B — UI профиля

Один cohesive task: SWR/useFetch admin surface, пошаговая форма, локальная
детерминированная validation, review/activation/version history и read-only
summary. Обязательны component authoring rules и browser fixture без network.

### Фаза C — общий resolver и provenance

Один cohesive task с source/fact research synthesis: `BrandProfileSelectionV1`,
`ResolvedBrandProfileContextV1`, platform merge, generation provenance и
fail-before-admission tests. Контекст композируется с source/fact context, но не
поглощает его ownership.

### Фаза D — generator, editor и agent

Один consumer-adoption task: selector/visible label, server resolution,
prompt-safe fragment, manual editor lint и сохранение provenance. Existing AI
operations остаются внутри `AiUsageService`; прямых клиентов нет. Каждый путь
заканчивается draft.

### Фаза E — AutoPost V2

Отдельный task из-за независимой Temporal/rollback границы: nullable pin,
explicit migration UI, новый versioned workflow/activity, draft-only result,
pause/reconciler при недоступной версии. Existing V1 не меняется и не получает
profile автоматически.

### Фаза F — root integration

Root синтезирует profile/source/fact contracts, принимает exact Prisma migration
и общий provenance schema, выполняет одну risk-based acceptance: focused tests,
browser matrix, `pnpm run build`, `pnpm test`, docs/brand/process checks и
Graphify refresh на принятой integration/release границе.

## 13. Материальные развилки и основания

| Развилка                                         | Решение                                     | Основание / цена                                                    |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| Org или user ownership                           | organization                                | общий голос четырёх consumers; цена — нужны admin rights и audit    |
| Кто меняет                                       | ADMIN/SUPERADMIN                            | совпадает с AI/org settings; USER остаётся рабочим потребителем     |
| Mutable active или snapshot                      | immutable published + clone                 | воспроизводимость; цена — больше версий                             |
| Dynamic AutoPost active или pin                  | pin concrete version                        | нет скрытой смены; цена — ручное обновление rule                    |
| Missing profile block или fallback               | visible neutral fallback                    | first-use работает; explicit missing всё равно block                |
| Hard delete или deactivate                       | soft deactivate                             | provenance/audit сохраняются; цена — retention данных               |
| Поля по колонкам или JSON blob                   | metadata columns + validated versioned JSON | атомарный snapshot и эволюция; цена — strict DTO/runtime validation |
| Отдельные platform profiles или overrides        | base + narrow additive overrides            | меньше drift; цена — merge tests                                    |
| ProductEvent или dedicated audit                 | dedicated audit                             | другой purpose/retention; цена — одна таблица                       |
| AI-first или manual-first                        | manual-first zero-model                     | работает без ключа/квоты; assist остаётся будущим явным действием   |
| Неявный active для legacy или explicit selection | новый UI explicit, absence = legacy none    | нет surprise behavior; цена — поле во всех consumers                |

Repository contract и root checkpoint дают безопасный ответ по всем этим
развилкам. Owner-choice blocker для начала реализации после общего research
synthesis не остаётся.

## 14. Evidence intake

- Product evidence:
  [Lazyweb Agentic Search](https://www.lazyweb.com/agentic-search/41b95e71-68b0-4bbb-8df0-259a853dafac).
- Выбранные паттерны: Writer — sample → tone analysis; Jasper — workspace
  voice/audience/rules/language и видимость voice + knowledge в generator;
  source registry — add URL, sync/status/ownership diagnostics.
- Использование в решениях: sample analysis остаётся будущим явным assist;
  ручные structured fields и visible version являются основным путём; voice и
  knowledge показываются как раздельные контексты; ownership/status видимы.
- Evidence не задаёт визуальный стиль. UI следует `PRODUCT.md`, `DESIGN.md`,
  ADR-0006/0008 и component authoring rules.

## 15. Что проверено и остаточный риск

Проверены локально: auth/tenancy, role guard, Prisma ownership patterns,
generator/editor/agent/AutoPost data flow, AI config/admission, текущий Temporal
contract и Graphify focused queries. Модельные, live network, publish, deploy и
production действия не выполнялись.

Остаточный риск до реализации:

- exact общий provenance schema зависит от синтеза source/fact streams;
- AutoPost V2 требует отдельного premortem по workflow versioning, pause и
  recovery;
- multiple platform AI cost остаётся product-operation metering, а не строгим
  per-provider-call budget;
- browser usability/доступность требует root-owned Lazyweb-informed fixture и
  локальную browser acceptance;
- production migration SQL и rollback подтверждаются только на реализации.

`graph-reviewed: used` — `graphify 0.9.45`, `graphify check-update .` и focused
queries по tenancy/permissions, AI admission, generator/editor и AutoPost.
Локальный report построен от `41baba7b`, текущий research HEAD — `1534b132`;
refresh не выполнялся, потому что это read-only research, а не принятая
integration/release граница.
