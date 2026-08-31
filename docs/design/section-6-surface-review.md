# Проверка поверхностей раздела 6

Этот реестр связывает раздел 6 `content-factory-interface-specification.md` с
реальными файлами. Статус **deferred** не означает, что работа исчезла: он
называет точную границу, которую нельзя безопасно закрыть одним только
визуальным рефакторингом.

| Поверхность | Текущее покрытие | Статус | Ограниченная причина |
| --- | --- | --- | --- |
| Analytics | `analytics/analytics.component.tsx`, chart files | deferred | Состояния empty/error и данные графиков задаются несколькими backend responses; перевод должен идти вместе с их явной state-моделью, а не подменять отсутствие данных декоративными карточками. |
| Platform analytics | `platform-analytics/*.tsx` | deferred | Разные provider payloads определяют колонки и доступность метрик; нужен один согласованный словарь отсутствующих метрик до замены поверхностей. |
| Settings | `settings/*.tsx` | deferred | Общие form controls и mobile hit target применены, но экран не имеет локально воспроизводимого provider state на обеих темах и 1440/1024/768/390; без него нельзя объявлять поверхность migrated. |
| Billing | `billing/*.tsx` | deferred | Купонное поле переведено на shared Input, но планы, trial и embedded Stripe зависят от внешнего checkout contract; локально нельзя безопасно проверить полный набор состояний без Stripe boundary. |
| Admin users/stats | `admin/admin-users.component.tsx`, `admin/admin-stats.component.tsx` | deferred | Поиск, диапазон дат и фильтр используют общие контроли, но Admin screen требует авторизованных данных для проверок обеих тем и контрольных ширин; Admin Errors остаётся вне этого потока как error-collection surface. |
| Developer/Public API | `developer/developer.component.tsx`, `public-api/public.component.tsx` | deferred | OAuth app fields и action heights мигрированы, но создание/ротация требуют авторизованного OAuth state; без него нельзя выдать browser evidence, не меняя protocol flow. |
| Preview | `preview/*.tsx` и provider previews | deferred | Внутренность preview обязана копировать внешний сервис; перевод допустим только для chrome, а не для platform-owned markup. |
| Extension | `app/(extension)/**` | deferred | Расширение имеет отдельный iframe/runtime contract и требует runnable extension host для визуальной проверки. |
| Provider add/OAuth | `launches/add.provider.component.tsx`, `app/(app)/oauth/**` | deferred | PlatformCard/Badge и shared form system владеют migrated частями, но provider-specific OAuth state требует авторитетных provider contracts и локальной учётной записи для browser evidence. |

Перед сменой `deferred` на `migrated` проверяются девять обязательных
состояний из спецификации, обе темы, 1440/1024/768/390px и длинные RU/EN
строки. До этого он остаётся явным ограничением, а не молчаливым допущением.
