# Desert-lab screen consumer adoption plan

**Goal:** Перевести реальные продуктовые экраны на примитивы `apps/frontend/src/components/ui`, подключить `ChannelMark` по его контракту и заменить календарную новую вкладку общим модальным предпросмотром без потери публичной страницы.

**Approach:** Один общий этап с отдельным коммитом на каждый экран или самостоятельную поведенческую границу. Внешний вид экранов мигрируется без изменения их логики. Предпросмотр разделён на сохраняющий поведение общий компонент, заранее подготовленный диалог и отдельный коммит, который меняет только календарную точку входа.

**Non-goals:** AI-provider settings, `libraries/nestjs-libraries/src/openai/**`, новые зависимости, новые цвета, удаление или закрытие `/p/[id]`, iframe, production/deploy/push.

## Scope ledger

- Каждый `ui/*` primitive имеет реального импортирующего потребителя либо записанную причину -> Tasks 1–6.
- `content-factory-next-0h7`: `ChannelMark` остаётся fallback реального аккаунта и самостоятельной provider mark -> Task 2.
- `content-factory-next-8ad`: календарный preview открывает доступный dialog, общий с `/p/[id]`, с copy-public-link -> Tasks 5–6.
- Один экран можно откатить одним revert -> commit boundary каждого task; общий helper отделён от экранного поведения.
- `pnpm run build`, `pnpm test`, `node scripts/branding/brand-scan.cjs` -> final acceptance Task 7.

### Task 1: Зафиксировать точный baseline и экранные границы

**Files:** `.codex/stages/content-factory-next-1db/**`, `.codex/handoff.md`, `.codex/orchestrator.toml`

**Boundary:** процессный коммит; не меняет продуктовый интерфейс.

**Verification lane:** no-new-test — orchestration metadata only; `check_stage_ready.py` and sizing linter own its contract.

- [x] Записать исходный consumer count и выбранные экраны.
- [x] Проверить stage manifest и Beads linkage.

### Task 2: Каналы и провайдеры

**Files:** `apps/frontend/src/components/launches/launches.component.tsx`, `apps/frontend/src/components/launches/add.provider.component.tsx`

**Boundary:** два экранных appearance-only коммита: channel list и provider picker.

**Interfaces:** `ChannelMark`; real account picture wins, provider/fallback uses mark.

**Verification lane:** no-new-test — DOM actions and data flow stay unchanged; compiler plus final browser inspection covers the visual substitution.

- [x] Подключить fallback в списке каналов, не вытесняя непустой `integration.picture`.
- [x] Подключить provider marks в выборе провайдера отдельным коммитом.

### Task 3: Календарные controls и слой уведомления

**Files:** `apps/frontend/src/components/launches/select.customer.tsx`, `apps/frontend/src/components/preview/copy.client.tsx`

**Boundary:** отдельные appearance-only commits для customer menu и copy confirmation.

**Interfaces:** `Popover`, `MenuItem`, `Toast`, `Button`.

**Verification lane:** no-new-test — callbacks, selection and clipboard contract are preserved; no new behavior branch.

- [x] Перевести customer menu на `Popover`/`MenuItem` без изменения выбора.
- [x] Перевести существующее подтверждение копирования на `Toast` и ui `Button`.

### Task 4: Состояния и данные модальных экранов

**Files:** `apps/frontend/src/components/launches/continue.integration.tsx`, `apps/frontend/src/components/launches/statistics.tsx`, `apps/frontend/src/components/launches/internal.channels.tsx`

**Boundary:** три screen-local appearance-only commits.

**Interfaces:** `Panel`, `Status`, `PageHeader`, `ErrorState`, `RestrictedState`, `Skeleton`, `SkeletonRows`, `Table`, `Th`, `Td`, `Tr`, `Section`, `Field`, `Input`, `Textarea`, `Select`, `Toggle`, `Button`, `EmptyState`.

**Verification lane:** no-new-test — existing fetch, form and callback behavior remains unchanged; exact affected design guards run after the migration batch.

- [x] Connection screen: общий header/panel и те же loading/success/error branches.
- [x] Statistics modal: semantic table and existing unavailable/empty states.
- [x] Internal channels: native-form-compatible ui fields/toggle, same react-hook-form values.

### Task 5: Извлечь общую разметку public preview

**Files:** `apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx`, `apps/frontend/src/components/preview/post-preview.tsx`

**Boundary:** refactor-only commit; прямой `/p/[id]` и его fetch/public contract не меняются.

**Verification lane:** no-new-test — mechanical extraction; exact public route stays in place and build proves server/client composition.

- [x] Вынести post markup и comments в общий компонент.
- [x] Оставить public route server-rendered и public fetch без изменения.

### Task 6: Добавить и подключить календарный preview dialog

**Files:** `apps/frontend/src/components/preview/post-preview-dialog.tsx`, `apps/frontend/src/components/launches/calendar.tsx`

**Boundary:** сначала отдельный component/appearance commit, затем behavior-only calendar wiring commit.

**Interfaces:** `Dialog`, `/public/posts/:id`, shared `PostPreview`, `CopyClient`.

**Verification lane:** tdd-required — до wiring зафиксировать Playwright repro: preview создаёт новую вкладку и не создаёт dialog; после wiring тот же сценарий должен показать dialog, copy button, Escape/outside close and focus return. Если локальная авторизованная сессия недоступна, записать это как ограничение без jsdom обхода.

- [x] Создать невключённый `PostPreviewDialog` на shared markup.
- [x] Убрать `window.open` только в отдельном calendar behavior commit.
- [x] Проверить direct public route отдельно.

### Task 7: Финальная приёмка и отчёт

**Files:** `.codex/stages/content-factory-next-1db/summary.md`, `.codex/handoff.md`, Beads state.

**Boundary:** один root-owned release acceptance; никаких push/merge/deploy.

**Verification lane:** release — пользователь явно требует полный build/test/brand-scan и дословный отчёт.

- [x] Пересчитать consumer table тем же методом и перечислить реальные import sites.
- [x] Run `pnpm run build`, `pnpm test`, `node scripts/branding/brand-scan.cjs`, `git diff --check`, process verification.
- [x] Self-review, graph review/refresh at accepted boundary, stage closeout, Beads close reasons.
