# Спецификация бренда и интерфейса Content Factory

**Статус:** `target specification`
**Дата проверки:** 2026-08-14
**Решение:** [ADR-0006](../adr/0006-content-factory-brand-and-design-language.md)
**Задача:** Beads epic `content-factory-next-zjm`

## 1. Результат

Postiz становится технической основой, но не пользовательской идентичностью. После этапа человек видит цельный продукт `Content Factory`: auth, оболочка, рабочие и служебные экраны говорят на одном визуальном языке и не ведут на продуктовые ресурсы Postiz.

Этот этап меняет бренд, информационную и визуальную подачу. Он сохраняет существующие бизнес-функции, данные, provider contracts, routes и безопасность. Новые доменные возможности прежнего Content Factory в этот этап не входят.

## 2. Основание дизайна

Направление собрано из трёх источников:

1. Принципы прежнего Content Factory в `/home/me/code/content-factory`: `apps/console/app/globals.css`, `apps/console/components/console-shell.jsx`, `docs/product/work-admin-mode-boundary.md` и макет `.codex/stages/content-factory-b5b/mockups/brand-voice-setup-layout-options.html`.
2. Текущая реализация Postiz: `apps/frontend/src/app/colors.scss`, `apps/frontend/src/components/new-layout/layout.component.tsx`, auth, calendar, composer, media, analytics, integrations и settings.
3. Снимок локального `/auth` на 1440×1000 и [Lazyweb preview-разбор от 2026-08-11](https://www.lazyweb.com/report/lazyweb/358425f7-2cff-48c2-b278-496856be5404/?source=create). Снимок является локальным исследовательским артефактом и не коммитится; полный Lazyweb toolkit не является зависимостью реализации.

Из старого продукта переносится не CSS и не разметка, а система: спокойная редакционная среда, тёмная подписанная навигация, ясные статусы, компактные формы и разделение Work/Admin.

## 3. Опыт и информационная архитектура

### Рабочий режим

Главный режим отвечает на четыре вопроса: что запланировано, что создавать сейчас, что требует решения и что уже опубликовано. Сюда относятся календарь, создание и редактирование публикации, drafts, media, integrations, agents и analytics. Недоступные будущие функции не появляются как рабочие ссылки.

### Администрирование

Организация, команда, billing, системные подключения, режим интерфейса, язык и административная диагностика находятся в отдельной группе. Опасные и необратимые действия визуально отделены и объясняют последствия.

### Навигация

- На desktop показываются знак, полное имя, подписи пунктов, текущая организация и явный active state.
- Сворачивание до иконок — настройка пространства, а не исходное состояние для обычного desktop.
- Верхняя панель содержит заголовок страницы, контекст и действия текущего экрана; глобальные настройки не конкурируют с primary action.
- На mobile обязательные функции доступны через drawer/compact header. Полный desktop sidebar не сжимается поверх контента.

## 4. Бренд-контракт

### Обязательная замена

- видимые `Postiz`, `postiz.com`, логотип и favicon;
- document titles, descriptions, manifest/OpenGraph и extension/provider chrome;
- auth, onboarding, product emails, support/feedback labels и ссылки;
- названия в пользовательских export/preview surfaces, где они означают продукт-отправитель;
- корневой README и актуальная документация продукта;
- alt text и accessible names брендовых assets.

### Разрешённые упоминания Postiz

- `LICENSE`, copyright, notices и AGPL source attribution;
- `upstream` remote и документация происхождения/миграции;
- исторические ADR, планы и принятые stage artifacts;
- dependency/package names третьих сторон и API/provider names, которые продукт не контролирует;
- внутренние legacy identifiers, если переименование ломает совместимость.

### Технические идентификаторы

Import namespace мигрирован на `@contentfactory/*`, а workspace package names — на продуктовые имена отдельной Beads-задачей `content-factory-next-wcx.1`. Environment variables, Prisma/table identifiers, Temporal workflow/activity names, provider slugs, OAuth protocol parameters и публичные API contracts не входят в эту миграцию. Любое их изменение по-прежнему требует отдельной миграции, теста совместимости и Beads-задачи.

## 5. Визуальная система

Канонические значения находятся в корневом [DESIGN.md](../../DESIGN.md), основание — [ADR-0008](../adr/0008-dark-first-desert-lab-visual-system.md). Реализация создаёт семантический слой токенов, а старые Tailwind names временно могут указывать на новые значения как compatibility bridge. Новые компоненты не используют `customColor1…55` напрямую.

Ключевые правила:

- dark-first: тёмная тема основная и самостоятельная, светлая — полноценная дневная, а не осветлённая копия;
- restrained palette, один зелёный action accent и редкая охряная подпись; новых семантических ролей не вводится;
- две гарнитуры из репозитория, без внешней загрузки шрифтов: Geologica на семь типографических токенов и JetBrains Mono на `label-sm` и `caption`; латиница и кириллица родные;
- навигация светлая в светлой теме и ниже канвы в тёмной; маркер текущего выбора проходит 3:1;
- sidebar 248px, свёрнутый 72px, базовый radius 8px;
- панели плоские, тени только у overlay;
- один тип кнопки/поля/status/navigation item на весь продукт;
- 150–250ms для смены состояния, обязательный reduced motion;
- focus не отключается глобальным `outline: none`;
- никаких gradient text, glassmorphism, декоративных сеток, огромных радиусов и одинаковых card grids.

## 6. Спецификация поверхностей

### Auth и восстановление доступа

Маршруты `/auth`, `/auth/login`, activation, forgot и login-required используют одну оболочку. На desktop слева находится компактная форма, справа — реальный обзор рабочего потока Content Factory без выдуманных отзывов, количества клиентов и рекламной карусели. На mobile остаётся форма, короткое обещание и доступ к условиям/политике через настроенные Content Factory URLs.

Google sign-in показывается только когда локальная конфигурация действительно поддерживает его. Email/password остаётся полноценным первым путём. Ошибки поля связаны с input через `aria-describedby`, submit имеет loading/disabled state, password manager и autofill не блокируются.

### App shell

Заменить 80px icon-only rail на подписанную навигацию. Сохранить существующие роли, billing gates, organization selector, notifications, language, theme и admin behavior. Убрать рекламные/extension элементы из главной иерархии: они могут жить в secondary menu, если функция остаётся нужной.

### Calendar и создание публикации

Календарь остаётся самой широкой рабочей поверхностью. Фильтры, диапазон дат и primary action образуют один toolbar; status/platform читаются без открытия записи. Composer сохраняет функциональность каждого provider, но общий каркас — выбор каналов, содержание, media, preview, schedule и validation — использует единые поля, секции и footer actions.

### Media, integrations и agents

Media library приоритетно показывает реальные assets, выбор и массовые действия. Integrations различает connected/attention/available и объясняет следующий шаг. Agents не получает отдельную «AI-магическую» палитру: AI — способность продукта, а не второй бренд.

### Analytics

Иерархия начинается с периода, охвата данных и одного рабочего вывода. Визуализация использует доступную категориальную палитру; декоративные hero metrics и одинаковые карточки не заменяют анализ.

### Settings, billing и admin

Настройки группируются по задаче и владельцу решения. Destructive zone отделена. Billing не обещает отсутствующие планы. Admin errors/stats сохраняют техническую плотность и ясно обозначают административный контекст.

### Preview, extension, provider и OAuth

Preview сохраняет точность отображения площадки, но chrome продукта принадлежит Content Factory. Extension/modal, provider add и OAuth authorize получают тот же wordmark, токены, поля, кнопки и error states. Социальные логотипы сохраняются только как обозначения внешних платформ.

## 7. Обязательные состояния

Каждая основная поверхность проверяется в состояниях: loading, empty/first-use, default, selected/active, success, recoverable error, permission/billing restriction, disabled и длинный контент. Empty state обучает следующему шагу; error сообщает причину в доступной форме и предлагает безопасное действие; skeleton повторяет структуру, а не маскирует страницу spinner.

## 8. Адаптивность и доступность

Проверочные ширины: 1440, 1024, 768 и 390px. Обязательны клавиатурный путь, видимый focus, 200% zoom, reduced motion, светлая/тёмная темы, русские и английские строки, отсутствие page-level horizontal overflow. Контраст: 4.5:1 для обычного текста и placeholder, 3:1 для крупного текста и границ управляемых элементов.

## 9. Границы этапа

Не входят: перенос доменной логики из donor, новые AI/model calls, новые социальные providers, изменение publication workflows, production deploy, реальные OAuth credentials, live publishing, юридические обещания и переименование внутренних contracts. Для Terms/Privacy используются конфигурируемые Content Factory URLs; Opus не сочиняет юридические документы.

## 10. Приёмка

1. Все актуальные пользовательские поверхности используют имя и assets Content Factory.
2. Brand scan проходит по allowlist, а не по нулевому числу строк `Postiz`.
3. Auth и app shell визуально и функционально приняты первыми; остальные экраны строятся на их токенах и primitives.
4. Light/dark и четыре контрольные ширины не имеют критических визуальных дефектов.
5. Keyboard, focus, label/error association, reduced motion и contrast соответствуют разделу 8.
6. Бизнес-поведение, routes, API, provider и Temporal contracts сохранены.
7. `pnpm run build`, `pnpm test`, `git diff --check` и `scripts/orchestration/run_process_verification.sh` проходят на финальной приёмке epic.
