# Правки по аудиту ветки work/own-error-collection

**Записано:** 2026-08-18
**Основание:** внешний аудит задачи `content-factory-next-ry5.4` (P1-1, P1-2, P2-1,
P2-2, P2-3, P3-1…P3-5). Отдельный коммит поверх `a863a501`, прежний коммит не менялся.

## Что было исправлено

| Находка | Где |
| --- | --- |
| P1-1 порядок глобальных фильтров Nest | `apps/backend/src/main.ts`, новый тест `tests/error-collection.filter-order.test.cjs` |
| P1-2 реестр исходящих не знал про сборщик | `docs/operations/outbound-connections.md` |
| P2-1 не собирались uncaught/unhandled | `libraries/helpers/src/errors/create.error.collection.options.ts`, `libraries/nestjs-libraries/src/sentry/initialize.sentry.ts`, `apps/frontend/src/sentry.server.config.ts` |
| P2-2 тест compose проверял сам себя и требовал docker | `tests/error-collector.compose.test.cjs`, снимок `tests/glitchtip-documented-settings.json` |
| P2-3 в кадрах стека не было ни файла, ни функции | `libraries/helpers/src/errors/sanitize.error.event.ts` |
| P3-1 поле `sdk` не описано | `docs/operations/error-collection.md` |
| P3-2 `@sentry/cli` под FSL-1.1-MIT | `docs/product/migration-map.md` |
| P3-3 устаревшая строка про Spotlight | `docs/operations/runtime.md` |
| P3-4 расписка приёмки без чисел Jest | `scripts/orchestration/run_stage_closeout.py`, `tests/test_orchestration_closeout.py` |
| P3-5 двойное условие включения | `apps/frontend/src/instrumentation.ts` |

Плюс не из отчёта, но по тому же поводу: в runbook сборщика добавлен раздел
«Память хоста — считать до развёртывания» со слагаемыми, известными репозиторию.

## Про acceptance-receipt.json

Расписка `acceptance-receipt.json` **не переписывалась вручную и остаётся такой,
какой её записал `run_stage_closeout.py`**. Подделывать её поля (`idempotency_key`,
`verification_fingerprint`, `diff_digest`) было бы ровно тем, против чего расписка
существует. Вместо этого исправлена причина.

Что именно было не так и что с этим сделано:

1. **Числа Jest в расписке отсутствовали.** `collect_result_counts` не знал ни
   одного шаблона Jest, поэтому от `pnpm test` — команды, которая последовательно
   запускает Jest и затем `unittest` — в расписку попадал только питоновский хвост
   `Ran 6 tests in 0.133s / OK`. Заявленные в handoff «72/72 suites и 605/605 tests»
   ничем не подтверждались. Добавлены шаблоны `^Test Suites:\s+\d` и `^Tests:\s+\d`,
   есть красно-зелёный тест `ResultCountsTest`. Следующая расписка запишет обе
   половины.
2. **`git_head` — базовый коммит, а не голова ветки.** Это не дефект расписки:
   closeout выполняется до коммита, поэтому фиксирует HEAD на момент проверки.
   Читать её нужно как «проверено на дереве поверх этого коммита», а привязка к
   содержимому идёт через `diff_digest`. Менять это поведение — отдельное решение,
   в объём правок по аудиту оно не входит.

Расписку для этой ветки должен перезаписать штатный прогон приёмки; после правки
в пункте 1 он запишет числа Jest сам.

## Границы

Ничего не развёртывалось, контейнеры не поднимались, к боевым системам обращений
не было. Значения DSN и любых секретов ни в коде, ни в документах не появились.
Решение о ёмкости хоста остаётся за владельцем: runbook только называет слагаемые.
