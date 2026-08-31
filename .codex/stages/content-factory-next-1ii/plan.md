# План второго ремонта Cloud-first SaaS

**Цель:** закрыть находки повторного аудита одним integration-stage с одним
итоговым acceptance.

**Подход:** шесть Beads issues соответствуют шести write-isolated группам.
Пять потоков кода идут параллельно; поток документации и записей идёт после
них, потому что он описывает уже существующее поведение и не имеет права
менять код.

**Spec:** `.codex/stages/content-factory-next-1ii/spec.md`.

## Scope ledger

- Auth throttle и цепочка заголовков ingress -> `content-factory-next-1ii.1`.
- AI: один Prisma pool, admission под конкуренцией, stream lifecycle,
  недостающий `createdAt` index -> `content-factory-next-1ii.2`.
- Telemetry: классификация `P2002` по имени constraint, descriptor и барьер
  цели retention -> `content-factory-next-1ii.3`.
- Публичная поверхность: форма invite-токена, ссылка входа, окно пароля при
  восстановлении -> `content-factory-next-1ii.4`.
- Claim guard: семейства формулировок, сканирование содержимого документов и
  всех locale keys, точные реестры -> `content-factory-next-1ii.5`.
- Документация и записи стадий -> `content-factory-next-1ii.6`.
- Отложенные продуктовые и релизные решения -> существующие открытые ворота,
  без изменений.

## Поток throttle

**Verification lane:** TDD-required для abuse controls.

- Добавить `login` и `resend-activation` в таблицу порогов, не трогая
  существующие два.
- Провести реальный адрес клиента через оба прыжка прокси; ingress обязан
  заменять заголовок, а не дополнять.
- Не хранить сырой адрес, User-Agent и cookie.

## Поток AI usage

**Verification lane:** TDD-required для lifecycle, конкуренции и границ DI.

- Одолжить резолверу credentials уже инжектированный Prisma client вместо
  собственного `PrismaClient`.
- Ограничить транзакцию допуска и повторять её с полным jitter; исчерпание
  попыток отдаёт отдельный код, а не квоту.
- Добавить `@@index([createdAt])` к `AiUsageRecord`; SQL получить офлайн.

## Поток telemetry

**Verification lane:** TDD-required для идемпотентности и удаления.

- Признавать duplicate receipt и по имени constraint, и по списку полей;
  форму `null` намеренно не признавать.
- Печатать `target` без credentials в dry-run и требовать его совпадения при
  apply до открытия соединения.

## Поток public surface

**Verification lane:** TDD-required для routing и валидации.

- Считать invite только значение формы JWT.
- Применить окно 12..64 к паролю, задаваемому по ссылке восстановления.
- Не трогать защищённые landing-файлы.

## Поток claim guard

**Verification lane:** TDD-required для самого guard.

- Заменить список фраз семействами формулировок с Unicode-границами.
- Сканировать содержимое контрактных документов и все locale keys; исключения
  держать точным shrink-only реестром.

## Поток документации и записей

**Dependency:** запускается после пяти потоков кода.

**Verification lane:** docs-only; исполняемых проверок не добавляет, опирается
на существующие guards.

- Исправить ложные утверждения в spec, readiness, auth/tenancy, deploy и
  configuration по фактическому коду.
- Записать отсутствующие операторские факты: `PUBLIC_GROWTH_DEDUPE_KEY`,
  окно пароля, таблица порогов, контракт ingress, `CF_SAAS_RETENTION_TARGET`,
  известные ограничения.
- Обновить runbook retention, добавить additive SQL и коды ошибок AI.
- Исправить ложные утверждения в записях стадии `q4p`, не переписывая её
  историю.
- Создать записи этой стадии, обновить handoff и project index.

## Корневая приёмка

- Просмотреть каждый возвращённый diff; исправления уходят тому же владельцу.
- Прогнать focused-наборы изменённых поверхностей, затем один полный
  acceptance под Node 22.23.2, pnpm 10.6.1 и `TMPDIR=/tmp`.
- Подтвердить неизменность защищённых файлов, создать receipt стадии и только
  после этого закрывать Beads-задачи.
