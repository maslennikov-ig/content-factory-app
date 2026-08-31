# Карта изменений

**Статус:** `current`
**Проверено:** 2026-08-11

Этот документ отвечает на вопрос «куда идти с конкретным изменением».

## Быстрый указатель

| Изменение | Основные места |
| --- | --- |
| Новый экран/route | `apps/frontend/src/app`, затем `apps/frontend/src/components` |
| Редактор или preview канала | `apps/frontend/src/components/new-launch` |
| Календарь/список постов | `apps/frontend/src/components/launches` |
| Authenticated API | `apps/backend/src/api/routes` + `api.module.ts` |
| Public API | `apps/backend/src/public-api` |
| DTO/validation | `libraries/nestjs-libraries/src/dtos` |
| Domain orchestration | service/manager в `libraries/nestjs-libraries/src` |
| Запрос к БД | repository/service в `database/prisma` |
| Изменение данных | `schema.prisma` + миграционная стратегия |
| Социальная платформа | provider + IntegrationManager + frontend provider UI |
| Долгая/отложенная операция | versioned workflow + activity в orchestrator |
| Общий UI/перевод | `libraries/react-shared-libraries` |
| Media storage | storage services в `nestjs-libraries` + env docs |
| Документация/решение | `docs/` + при необходимости ADR |

## Backend slice

Предпочтительная последовательность:

```text
DTO -> Controller -> Service/Manager -> Repository -> Prisma
```

- DTO валидирует внешний shape.
- Controller получает `org`/`user`, применяет policy и переводит HTTP в use case.
- Service/Manager применяет бизнес-правила и координирует зависимости.
- Repository содержит tenant-scoped Prisma query.
- Возвращаемый контракт не должен раскрывать token/secret fields.

Не помещайте бизнес-логику только во frontend. `PostsController.createPost` — пример повторной server-side validation.

## Frontend slice

Страницы App Router собирают продуктовые components. Существующий UI использует SWR, `fetch`/`useFetch`, context и shared libraries. Для редактора:

- [launches component](../../apps/frontend/src/components/launches/launches.component.tsx) — оболочка календаря;
- [calendar context](../../apps/frontend/src/components/launches/calendar.context.tsx) — загрузка и локальное состояние постов;
- [add/edit modal](../../apps/frontend/src/components/new-launch/add.edit.modal.tsx) — редактирование материала;
- `components/new-launch/providers/*` — provider-specific settings и preview.

Новый Content Factory UI не должен прятать доменную логику в React state. Серверный контракт и tenant ownership проектируются одновременно.

## Новый provider

Следуйте [интеграциям и публикации](../architecture/integrations-and-publishing.md#как-добавить-или-изменить-платформу). Идентификатор provider — хранимый контракт, а validation должна выполняться на сервере.

## Новый workflow

- workflow содержит только детерминированную оркестрацию;
- I/O выполняется в activity;
- retries/timeouts задаются сознательно;
- имена и payload уже запущенных activity/workflow не меняются несовместимо;
- новая последовательность получает новую версию и экспортируется в `workflows/index.ts`;
- старый код удаляется только после доказательства отсутствия незавершенной/сохраняемой истории.

## Новая сущность Content Factory

До реализации ответьте в plan/ADR:

1. Кто владелец — `Organization` или другой объект?
2. Какие состояния и переходы являются допустимыми?
3. Что неизменяемо для аудита?
4. Как объект экспортируется и удаляется?
5. Какие поля чувствительны?
6. Как он связан с существующим `Post`, не дублируя доставку?
7. Какая проверка докажет межтенантную изоляцию?

## Документация как часть изменения

Обновите документ в том же PR/коммите, если меняются:

- граница модуля или направление зависимости;
- Prisma entity/relation/state;
- route, auth или public contract;
- workflow/activity/provider contract;
- обязательная/опасная env variable;
- локальный запуск, build или проверка;
- принятое долговечное решение.

Правила и команды — в [сопровождении документации](../maintenance/documentation.md).
