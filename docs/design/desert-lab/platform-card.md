# Карточка платформы — измерения и решения

Записано 17.08.2026 по итогам дизайн-пасса `content-factory-next-0cy`. Бриф — `docs/prompts/design-platform-element-card.md`. Канонические значения цвета и типографики — в [`../../../DESIGN.md`](../../../DESIGN.md), карточка от них не отступает.

Приём тот же, что у знака `Cf 98` ([`mark.md`](mark.md)): карточка химического элемента. Логотип платформы занимает место символа, слот порядкового номера занимает число уже подключённых каналов, имя платформы стоит под символом. Всё, кроме логотипа, — наше.

**Логотип не перерисовывается, не перекрашивается, не тонируется и не обрезается.** Последнее было не гипотезой: в шести местах на него вешали `rounded-full`, и у квадратного знака срезались углы. Наш стиль приходит через рамку.

## Три размера и что отпадает

| Размер | Где | Что несёт |
|---|---|---|
| L · 112×152 | сетка подключения платформ | номер, поле логотипа 56, имя, уточнение |
| S · 16 / 24 / 32 | значок на аватаре канала | рамка и логотип |

Высота фиксирована, ширину задаёт сетка; 112 — та ширина, которую даёт девятиколонная раскладка на широком экране.

**Карточка маленькая намеренно, и по двум причинам сразу.** Таблица, откуда взят приём, читается ровно потому, что помещается на один экран целиком: тридцать пять платформ в две колонки — это шесть экранов прокрутки и никакой таблицы. Поле логотипа — 56px: четыре проверенных immutable вектора используют его целиком, а унаследованный растр 50×50 ограничен 48px и остаётся чётким. Минимальная ширина на карточке выглядела аккуратно и оказалась неверной: `auto-fill` тогда отвечает не карточке, а полям вокруг пикера, и на 390px это замерилось как одна колонка и тридцать пять строк прокрутки.

Знак роняет массу на 24px и номер на 16px. Карточка платформы роняет номер и имя на шаг раньше: в позиции символа стоит картинка со своей внутренней детализацией, а не двухбуквенный глиф, и ей нужно больше площади.

Промежуточный размер M **не построен**. Ни один экран его сегодня не просит, а неиспользуемый вариант — это код, который некому проверить. Появится потребитель — появится `size="md"`.

### Значок и аватар

Отношение аватар : значок = 2 : 1, три ступени:

| Ступень | Где | Логотип внутри рамки |
|---|---|---|
| 32 / 16 | ячейка календаря, строка фильтра каналов, превью, онбординг — узкие ряды | 12 |
| **48 / 24** | умолчание: списки каналов, превью, выбор каналов | 16 |
| 64 / 32 | где есть место: карточка канала, настройка агента | 24 |

До этого размеров было девять: 12, 14, 15, 16, 18.41, 20, 30, 32, 36. Ни один не был выбран; `18.41px` — унаследованное число, стоявшее в четырёх файлах. Его в репозитории больше нет.

Рамка значка — 1px `border-control`, радиус 4 на всех трёх ступенях, фон `surface-raised`. `mark.md` задаёт радиус 8 от 48px и 4 на 24px и ниже, а ступень 32 попадает в незакрытый промежуток: она ближе к 24, и рамка радиуса 8 на 32px читалась бы как скруглённый квадрат, а не как метка. Чистое поле вокруг знака 2px на нижней ступени и 4px на двух остальных: на этом масштабе знак защищает абсолютный запас, а не пропорция.

### Аватар канала — символ платформы

Аватар канала без картинки теперь показывает **назначенный символ платформы** в левом верхнем углу ячейки: `Tg`, `Li`, `Lk`, `Wp`. Компонент — `PlatformSymbol`, три ступени 32/48/64 под те же пары со значком.

Символы **назначены, а не выведены**, ровно как в самой таблице: железо это `Fe`, а не `Ir`. Вывод из идентификатора этот продукт уже пробовал, и `linkedin`, `linkedin-page` и `listmonk` отрисовались как `LI` — записано в `content-factory-next-a4p`. Назначенная таблица из 35 символов уникальна, уникальность держит тест.

Угол, а не центр: в противоположном углу сидит значок платформы, и при центрировании они накладывались.

**Чем платим.** Символ обозначает платформу, а не канал, поэтому четыре канала Telegram без аватарок — четыре одинаковых `Tg`. Различает только имя канала рядом. Решение владельца, принятое с нарисованным рядом сравнением: инициалы канала (`РЕ`, `НО`, `АН`, `КЛ`) против символа платформы. Отсюда следует, что правило «имя канала всегда написано рядом со значком» здесь не рекомендация, а единственный разделитель.

Кегль символа берётся не из девяти токенов, а из пропорции знака: 13px на 32px, как в [`mark.md`](mark.md) и как это уже делает `ChannelMark`. Два знака стоят в списках рядом, поэтому масштабируются одинаково. Задано инлайновым стилем — то же исключение, что у `ChannelMark`, и `tests/design.typography.test.cjs` его не видит; это записано в самом компоненте, а не оставлено дырой.

`ChannelMark` остаётся и по-прежнему берёт инициалы канала: он верен там, где канал должен назвать себя сам, без подписи рядом.

## Сетка выбора: полосы семейств

Девять семейств из приложения B брифа идут полосами: заголовок `cf-label-md`, рядом счётчик `cf-caption`, дальше линейка до края. Счётчик стоит у имени, а не на другом конце линейки: на широком экране тот конец в тысяче пикселей, и число, которое не с чем связать, — украшение.

Число колонок названо, а не выведено: `grid-cols-3 sm:5 md:6 lg:7 xl:8 2xl:9`, шаг 8px. Одна раскладка работает от 390 до 1440, второй вёрстки нет.

Брейкпоинты дефолтные — конфиг Tailwind добавляет свои имена через `extend` и не переопределяет их, так что это 640/768/1024/1280/1536. Отсюда: 3 колонки на 390, 6 на 768, 7 на 1024, 8 на 1440, девять — от 1536.

**Против чего пошли.** Дизайн-пасс предлагал жёсткие девять колонок, где семейство — это столбец. Отказались от колонок, но не от плотности: 9 × 96 + зазоры плюс рельс 248px требуют экрана не уже 1272px, а на контрольной ширине 1024 такая сетка не встаёт вообще. Полосы дают ту же плотность и переносятся сами.

Промежуточный проход этой работы качнулся в другую крайность — карточка 160×180 с логотипом 56px. Ошибка была двойная: она рвала связь с приёмом (таблица плотная, плитки нет) и растягивала растровый знак. Запись оставлена нарочно: возражение против девяти колонок относилось к раскладке, а размер карточки под него подверстался зря.

Семейство несут позиция и заголовок. Платформа, которой нет в карте семейств, попадает в полосу «Прочее», а не пропадает: молча не показать канал хуже, чем показать его не в той группе. `tests/platform.card.test.cjs` сверяет карту с содержимым `apps/frontend/public/icons/platforms/`, так что новый провайдер без семейства валит сборку.

## Цвета семейств: замерены и отклонены

Дизайн-пасс просил новую цветовую роль `family-*` — восемь цветов плюс `signature` для «Своего». Роль **не заведена**.

Контраст все девять проходят: 3.14–4.82 к канве и 3.56–4.46 к `surface` в обеих темах при пороге 3:1. Различимость — нет. Чтобы дать 3:1 и на `#14150F`, и на `#EFE9DB`, цвет обязан сидеть около L\* 58, а девять оттенков в одной полосе светлоты стоят слишком близко:

| Зрение | Минимальное ΔEok по палитре | Пара |
|---|---|---|
| норма | 5.3 | «Открытые сети» / «Профессиональные» |
| протанопия | 2.4 | «Сообщества» / «Публикации» |
| дейтеранопия | **0.4** | «Открытые сети» / «Визуальные» |

При дейтеранопии `#00907E` и `#B94D81` сходятся в `#7b7b80` и `#7a7a7e` — это один цвет, а не близкий. Даже в норме два бирюзовых почти неразличимы.

Собственный замер дизайн-пасса уже понизил цвет до избыточного признака в заголовке группы. Отсюда один шаг до вывода, который мы и сделали: признак, который ничего не решает и который половина читателей видит одинаково, дешевле не заводить. `DESIGN.md` держит экран почти целиком на нейтралях, `colors.scss` и `contrast-pairs.md` не растут, счётчик пар остаётся 47.

## Охра: убрана из карточки

Дизайн-пасс набирал номер каналов цветом `signature` на каждой подключённой карточке — в его же данных это 13 охряных пятен на одном экране. `DESIGN.md` разрешает одно-два и запрещает трафаретную метку на каждом элементе.

Номер набран `ink` у подключённой платформы, а у нулевой слот **пуст**. Это не деталь, а суть слота: в таблице, откуда взят приём, номер — тождество, двух одинаковых не бывает. Здесь он считает каналы, и у клиента с шестью подключёнными двадцать девять карточек показывают один и тот же «0» — метка, которая должна была их различать, становится самым частым знаком на экране. Пустой слот различает с одного взгляда, стена нулей — нет. Заодно ушёл провал контраста: `signature` на `accent-soft` в светлой теме даёт 3.77:1 при пороге 4.5 для текста, то есть на любой выбранной карточке дневной темы номер не проходил.

## Состояния

| Состояние | Как набрано |
|---|---|
| default | фон `surface-raised`, рамка 2px `border-control` |
| hover | фон `surface-subtle` — та же конвенция, что у `secondary` в `form/button.tsx` |
| active | `cf-pressed` — единственное значение вне палитры, живёт в `tailwind.config.cjs` |
| focus-visible | кольцо 2px `focus` с отступом 2px, из `choice/control.button.tsx` |
| selected | рамка 2px `accent`, фон `accent-soft`, галка в углу, имя `cf-label-md` |
| selected + hover | рамка `accent-hover` |
| disabled | рамка остаётся `border-control`, приглушение несёт `disabled:opacity-50` от примитива |
| 0 каналов | номер и имя `ink-muted`, номер «0»; рамка остаётся `border-control` |
| loading | скелет той же геометрии, не spinner |

Блок подписи фиксированной высоты 56px, поэтому он обязан отказываться переполняться, а не надеяться. Имя в две строки это 38px, плашка уточнения 24px — вместе с зазором 66px в коробке 56px. Правило: когда уточнение показано, имя отдаёт вторую строку.

У пяти провайдеров есть предупреждение, от которого зависит, получится ли подключение вообще: Instagram требует бизнес-аккаунт, привязанный к странице Facebook, Bluesky — выключенной двухфакторной аутентификации, Nostr — ключа в HEX. Старая плитка рисовала «?» в углу; карточка его сохраняет, иначе предупреждение существует только для того, кто случайно навёл мышь, а на сенсорном экране — ни для кого.

**Рамка покоя — `border-control`, а не `border-strong`.** Дизайн-пасс ставил `border-strong`, который даёт 2.00:1 в тёмной теме и 2.28 в светлой, и который `contrast-pairs.md` прямо относит к разделителям. Карточку кликают — её граница обязана держать 3:1, и роль для этого одна: `border-control`, 4.25 / 3.96.

**Выбор различим без цвета.** Галка — фигура, которая появляется; имя меняет вес с `cf-body-sm` на `cf-label-md`; контрол несёт `aria-pressed`. Внешний угол галки повторяет радиус карточки, чтобы они читались одним объектом.

## Близнецы

`instagram` / `instagram-standalone`, `mastodon` / `mastodon-custom`, `linkedin` / `linkedin-page` — один логотип, разные назначения. Различает уточнение: моноширинная плашка в рамке под именем.

Имена провайдеров сами по себе разделяют их плохо: бэкенд зовёт их `Instagram\n(Facebook Business)`, `LinkedIn Page` и — хуже всех — `M. Instance`, что даже не говорит «Mastodon». Поэтому обе половины пары показывают одно имя платформы, а разницу несёт плашка:

| Идентификатор | Имя | Уточнение |
|---|---|---|
| `instagram` | Instagram | бизнес |
| `instagram-standalone` | Instagram | прямой |
| `mastodon` | Mastodon | основной |
| `mastodon-custom` | Mastodon | свой |
| `linkedin` | LinkedIn | профиль |
| `linkedin-page` | LinkedIn | страница |

Одно короткое слово, потому что плашка не переносится. Первая версия писала «через страницу Facebook» и обрезалась до «через страницу»; вторая уместилась в двенадцать знаков, но карточка потом стала плотнее, и `standalone` снова перестал влезать. Обрезанное уточнение хуже отсутствующего, раз разделять пару было его единственной работой. Пара всегда стоит рядом, так что двум словам достаточно отличаться друг от друга: «бизнес» против «прямой» говорит, какой это Instagram, и ни одному из слов не нужно быть самодостаточным. `tests/platform.card.test.cjs` держит потолок в девять знаков во всех шестнадцати локалях.

На размере S не различает ничего, поэтому действует правило: **значок никогда не единственный носитель** — рядом всегда имя канала.

## Разрешение знаков — потолок качества

Большинство отгруженных логотипов — растр **50×50**; ниже перечислены четыре
исключения с проверенным неизменённым векторным исходником.

В карточке знак живёт в поле 56px. Проверенные векторы занимают его целиком; оставшийся растр ограничен 48px, то есть остаётся меньше исходного 50×50. Значок-аватар по-прежнему использует отдельную компактную шкалу 12/16/24px.

Поэтому логотип занимает **48px в поле 56px**: под исходным разрешением, то есть резко на обычном экране, и с большим чистым полем вокруг знака, которое бриф и просил. На экране с удвоенной плотностью растяжение остаётся — 96 пикселей из пятидесяти, — и никаким размером это не лечится: чтобы быть резким при 2×, знак пришлось бы рисовать не крупнее 25px. Настоящее решение одно — официальные векторные ассеты вместо растра, и это задача снабжения, а не дизайна: перерисовывать чужой знак нельзя.

### Происхождение и решение по векторным знакам

`PlatformBadge` предпочитает только четыре проверенных immutable SVG:
`listmonk`, `lemmy`, `devto` и `mastodon`; `mastodon-custom` использует тот же
неизменённый знак только для идентификации Mastodon-провайдера. Каждый файл
загружен по pinned commit, не переформатирован и проверяется SHA-256 контрактом.
`youtube` и все остальные неутверждённые идентификаторы продолжают выбирать
существующий PNG. Это не утверждение, что официального вектора не существует:
для замены нужен первичный URL, неизменённый файл и применимое разрешение на
распространение в продукте.

| Identifier | Immutable source and terms | Decision |
| --- | --- | --- |
| `listmonk` | [raw SVG](https://raw.githubusercontent.com/knadh/listmonk/3135bfc12a2d7323558723a819b227ebec5c776f/static/public/static/logo.svg), [AGPL-3.0](https://github.com/knadh/listmonk/blob/3135bfc12a2d7323558723a819b227ebec5c776f/LICENSE), SHA-256 `2c3e6b34a78e9a6405e5e262894d21725ffe897d7261a711cc3e849a5ff65865` | Unchanged SVG. |
| `lemmy` | [raw SVG](https://raw.githubusercontent.com/LemmyNet/joinlemmy-site/0aad0392bce8585636e2a98146bad854ee8fe92f/src/assets/images/lemmy.svg), [Andy Cuccaro attribution](https://github.com/LemmyNet/lemmy/blob/439734dd638a2c06a2f907beab7dcf4646e88f861/README.md#credits), [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en), SHA-256 `9d4bea45276d4a52e84cf8635fb83ecceb5181622df1311771b11cb98483373b` | Unchanged SVG with attribution. |
| `devto` | [raw SVG](https://raw.githubusercontent.com/forem/forem/178a0492627f89ac6e0d86ae63b9dae1d0a3b75d/app/assets/images/devplain.svg), [AGPL-3.0](https://github.com/forem/forem/blob/178a0492627f89ac6e0d86ae63b9dae1d0a3b75d/LICENSE.md), SHA-256 `5b0efe8c94ff7c6db6eccc6c4c7df4c38d4676f1f8fc613e60bfad4a7eedd631` | Unchanged SVG. |
| `mastodon`, `mastodon-custom` | [raw SVG](https://raw.githubusercontent.com/mastodon/mastodon/13b13c8726c1e81d02abc389f8b9bce19df6dbe2/app/javascript/images/logo-symbol-icon.svg), [AGPL-3.0](https://github.com/mastodon/mastodon/blob/13b13c8726c1e81d02abc389f8b9bce19df6dbe2/LICENSE), [trademark](https://joinmastodon.org/trademark), [branding](https://joinmastodon.org/branding), SHA-256 `e92184e36e3bba38ee406bba10e7a85eab9f9b2a55dcb5725394f7db49151abc` | Unchanged provider identification; no affiliation claim. |

### Подложка под чёрным знаком

Три из этих векторов — `devto`, `listmonk` и `mastodon` (вместе с
`mastodon-custom`) — нарисованы чёрным или `currentColor`. На тёмном холсте они
исчезают. Перекрасить их нельзя: это чужие знаки, и весь смысл раздела выше в
том, что файл остаётся байт в байт исходным. Поэтому под знак кладётся светлая
подложка — в карточке размером с поле знака, 56px, в значке-аватаре размером с
рамку, — и **только в тёмной теме**: `dark:bg-cf-ink`. В светлой теме
подложка не нужна и её нет, иначе вокруг четырёх знаков из тридцати пяти
появляется белый квадрат, отличающийся от фона карточки (`surface-subtle` при
наведении, `accent-soft` при выборе).

Токена `surface-inverse` в системе нет, и здесь используется `ink` как
поверхность. Это сознательно, а не по недосмотру: в тёмной теме `ink` —
`#ECEBDF` — и есть та самая светлая поверхность, а парный к ней `ink-inverse`
уже существует для текста поверх неё. Отдельный токен был бы вторым именем для
одного и того же значения, которое обязано совпадать с `ink` всегда. Правило
узкое: подложка — свойство ассета (`platformAsset().neutralPlate`), а не роль в
интерфейсе, и появляется только под самим знаком. Под запасным символом
(`Dv`, `Lm`, `Ms`, когда файл не загрузился) подложки нет — там текст рисуется
тем же `ink`, и контраст был бы 1:1. `tests/platform.card.test.cjs` держит обе
половины правила.

### Retained rasters

Each row below accounts for every remaining identifier in the shipped PNG
inventory exactly once (aliases are grouped only where the mark and terms are
identical). Result in every case: **retained PNG — exact immutable official SVG
plus applicable redistribution evidence was not verified in this pass.** This
is a bounded current result, not a claim that a vector can never be used.

| Identifier(s) | Primary source(s) / concrete boundary |
| --- | --- |
| `bluesky` | [icons](https://bsky.social/about/support/icons) and [branding](https://bsky.social/about/support/branding); no immutable repository-ready SVG verified. |
| `discord` | [branding](https://discord.com/branding) and [Developer Terms](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service). |
| `dribbble` | [media kit](https://dribbble.com/media-kit). |
| `facebook` | [Meta brand resources](https://about.meta.com/brand/resources/) and [Meta terms](https://www.facebook.com/legal/terms). |
| `gmb` | [Google products](https://about.google/brand-resource-center/products-and-services/) and [guidance](https://about.google/brand-resource-center/guidance/); obsolete inherited identifier, not current Google Business Profile branding. |
| `hashnode` | [Hashnode brand](https://hashnode.com/brand). |
| `instagram`, `instagram-standalone`, `threads` | [Meta brand resources](https://about.meta.com/brand/resources/) and [Meta terms](https://www.facebook.com/legal/terms); identical Meta-mark terms. |
| `kick` | [Kick brand](https://about.kick.com/brand) and [terms](https://kick.com/terms-of-service). |
| `linkedin`, `linkedin-page` | [brand downloads](https://brand.linkedin.com/downloads) and [guidelines](https://brand.linkedin.com/); identical LinkedIn mark terms. |
| `medium` | [logo guidelines](https://help.medium.com/hc/en-us/articles/213481348-Medium-Logos-Brand-Guidelines) and [trademark policy](https://help.medium.com/hc/en-us/articles/213690137-Trademark-Policy). |
| `mewe` | [MeWe](https://mewe.com/) and [terms](https://mewe.com/terms). |
| `moltbook` | [terms](https://www.moltbook.com/terms). |
| `nostr` | [canonical protocol](https://github.com/nostr-protocol/nostr) has no official logo; [community button design](https://github.com/SovrynMatt/Nostr-Website-Button-Design) is not an official source. |
| `pinterest` | [business guidelines](https://business.pinterest.com/en-us/brand-guidelines/) and [brand login](https://brand.pinterest.com/account/login); downloadable assets are login-gated. |
| `reddit` | [brand](https://redditinc.com/brand), [trademark policy](https://redditinc.com/policies/trademark-use-policy), and [developer terms](https://redditinc.com/policies/developer-terms). |
| `skool` | [terms](https://www.skool.com/legal?t=terms). |
| `slack` | [media kit](https://slack.com/media-kit). |
| `telegram` | [Telegram Press](https://www.telegram.org/press). |
| `tiktok` | [design guidelines](https://developers.tiktok.com/doc/getting-started-design-guidelines) and [brand](https://www.tiktok.com/about/brand). |
| `tumblr` | [trademark guidelines](https://help.tumblr.com/knowledge-base/trademark-guidelines/) and [developer resources](https://help.tumblr.com/knowledge-base/developer-resources/). |
| `twitch` | [brand](https://brand.twitch.com/) and [trademark policy](https://legal.twitch.com/legal/trademark/). |
| `vk` | [brand guidelines PDF](https://corp.vkcdn.ru/media/files/211021_vk_brand_guidelines_master_v2_1.pdf) and [company](https://vk.company.ru/ru/company/about/). |
| `whop` | [brand](https://brand.whop.com/) and [brand terms](https://whop.com/brand/). |
| `wordpress` | [logos](https://wordpress.org/about/logos/) and [trademark policy](https://wordpressfoundation.org/trademark-policy/). |
| `wrapcast` | Inherited spelling; [Farcaster GitHub](https://github.com/farcasterxyz) and [protocol](https://github.com/farcasterxyz/protocol) contain no first-party Warpcast SVG. |
| `x` | [brand toolkit](https://about.x.com/en/who-we-are/brand-toolkit) and [brand guidelines PDF](https://about.x.com/content/dam/about-twitter/x/brand-toolkit/x-brand-guidelines.pdf). |
| `youtube` | [official icon page](https://brand.youtube/youtube-icon/), [exact official package](https://www.gstatic.com/marketing-cms/78/29/3e68a1414bb28d0b7e47b44c3c91/youtube-icon.zip), [branding guidelines](https://developers.google.com/youtube/terms/branding-guidelines), and [API terms](https://developers.google.com/youtube/terms/api-services-terms-of-service); the package contains PNG, AI, EPS and PDF but no SVG, while the CMS URL has no verifiable immutable-version guarantee. |

No retained raster is recoloured, redrawn or cropped.

#### YouTube: зафиксированное raster-решение

Проверено 20 августа 2026 года только по первичным Google/YouTube-источникам.
Страница YouTube Icon ссылается на ZIP выше напрямую с `www.gstatic.com`.
Полученный ZIP имеет SHA-256
`ca9b5104387e0f7afcfda3a79c910449561112f1077177dd0d64f8c72f56e476`,
дату `Last-Modified: Tue, 18 Nov 2025 19:34:15 GMT` и не содержит SVG.
Его 32-символьный CMS identifier не совпадает с MD5 ZIP
(`0200993c37b301c761dd287a0716c863`); ответ даёт только
`Cache-Control: public, max-age=3000`, без `immutable`, `ETag` или
content-digest. Поэтому этот URL доказывает официальный текущий пакет, но не
неизменяемую версию точных SVG-байтов.

Локальный `youtube.svg` имеет SHA-256
`c9bad509c5f6b66101624eb0f4fcef9fcb129a9484fae0a4626c4df2c20cd083`.
Он пришёл из upstream-коммита `004ffcabb0a5ae46e95152c7cf83b04acdc30f44`
без первичного URL или условий, а в текущем официальном пакете сопоставимого
SVG нет. Продвигать его через resolver нельзя. Resolver сохраняет существующий
`youtube.png` с SHA-256
`514baa2a99ddf85059571ae3ebe84817a1442f6e120e8b18260b7c7177b2efbe`.
Новые байты не добавляются; ни SVG, ни PNG не перерисовываются, не
перекрашиваются и не переформатируются.

Это решение про провенанс, а не самостоятельное разрешение на товарный знак.
Официальная страница требует скачивать последнюю версию, сохранять белый
треугольник в полноцветном красном значке, не добавлять обводку, тень или
свою цветовую схему, не вращать и не искажать знак; минимальная цифровая высота
указана как 100px. API Branding Guidelines дополнительно требуют связывать
значок с YouTube-контентом или YouTube-компонентом, не изменять и не закрывать
его, не делать самым заметным элементом и не создавать впечатление одобрения.
Текущие поля 48px и меньше не удовлетворяют опубликованному минимуму 100px,
поэтому этот поток не утверждает соответствие текущего показа trademark rules;
он лишь запрещает недоказанную SVG-подмену. Исправление размера или поведения
ссылки относится к отдельному интерфейсному/protocol review.

Этот отдельный обзор завершён. Все девятнадцать поверхностей со знаком, их
размеры, назначение ссылок и четыре просчитанных пути перечислены в
[инвентаризации знака YouTube](youtube-mark-inventory.md). Владелец выбрал
31 августа 2026 года четвёртый путь: показ остаётся как есть, а расхождение с
опубликованными правилами — размер ниже 100px и отсутствие требуемой ссылки —
записано как принятый риск. Размеры и ссылки не менялись, и соответствие
по-прежнему не утверждается нигде. Условия показа проверялись только у YouTube;
у остальных тридцати четырёх знаков проверялось происхождение файла, но не
правила отображения
(задача `content-factory-next-2la`). Решение остаётся за владельцем; ни этот
файл, ни тот соответствия не заявляют.

Условия показа остальных тридцати четырёх знаков проверены 05.09.2026 по первичным страницам платформ и записаны в [условиях показа знаков платформ](platform-mark-display-rules.md) (задача `content-factory-next-4s0l`).

## Чего в продукте нет, а в комплектах было

Два места, где комплект проектировал композицию, которой у нас не существует. Записано, чтобы следующий читатель не искал пропажу.

**Пикер в комплектах многовыборный.** Там счётчик «ВЫБРАНО 2», галка на карточке и кнопки «Отмена / Подключить выбранные» внизу. Наш пикер одношаговый: клик по карточке сразу уводит в OAuth провайдера. Состояния `selected` и `selected + hover` построены, потому что их требовал бриф, но потребителя у них сегодня нет. Отсюда же правило: `aria-pressed` появляется, только если вызывающая сторона явно передала `selected`. Объявлять переключатель там, где клик выполняет действие, — говорить незрячему читателю неправду про каждую карточку на экране.

**«+N после четырёх значков» реализовано в Calendar.** Плотная строка показывает первые четыре платформенных значка, а оставшиеся сворачивает в `+N`; доступное имя остатка сообщает полное количество скрытых каналов. Так строка фильтра и календарная ячейка не расширяют ряд бесконечно на узкой ширине, но клавиатурный и screen-reader пользователь не теряют информацию о каналах.

## Где это лежит

- `libraries/react-shared-libraries/src/platform/platform.card.tsx` — карточка, на `ControlButton`.
- `libraries/react-shared-libraries/src/platform/platform.badge.tsx` — значок.
- `libraries/react-shared-libraries/src/platform/platform.families.ts` — девять семейств, шесть близнецов.
- `apps/frontend/src/components/launches/add.provider.component.tsx` — сетка подключения платформ, единственный дом карточки L.
- `tests/platform.card.test.cjs` — компоненты отрисовываются, а не читаются как текст: обрезку логотипа, различимость выбора без цвета и отсутствие охры видно только в выводе.
