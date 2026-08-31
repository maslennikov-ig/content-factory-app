# Stage Summary: content-factory-next-l9s

Статус: принят. Все четыре волны локально слиты в `main`; публикация и production-действия не выполнялись.

## Волна 4 — надёжность и данные

- `content-factory-next-c6k.15`: in-memory retry map заменён аддитивной `TelegramUpdateFailureState`. Новый owner продолжает счётчик прежнего процесса; effect, retry, write-off и cleanup выполняются только в транзакции, ограждённой текущим lease owner. Process clocks оставлены без raw SQL: тест с расхождением +60 секунд доказывает post-poll и mid-batch recheck, а unique receipt оставляет ровно один эффект на update. 15-минутная заявка подключения показывает `Start again`, создаёт новое слово и запускает новый запрос.
- `content-factory-next-7g0`: добавлены атомарные SHA-256-защищённые dumps product, `temporal`, `temporal_visibility` и globals; оба будущих host entry point используют wrapper с quiesced окном `cf-app` → `cf-temporal`, а restart failure не скрывается. Restore до mutation требует отдельную bootstrap-role, пустой disposable-labelled target и восстанавливает объекты под source runtime role.
- Первое независимое ревью вернуло P1 по недоступным runtime-role объектам и два P2 по неполному empty-target guard и несогласованным live dumps. `bccb4228` закрыл все три: real proof читает и пишет как source role во всех трёх БД, отвергает unquiesced/unlabelled/dirty cases и очищает только свои ресурсы. Повторное ревью — ACCEPT, открытых P0–P3 нет.
- Production, существующие Docker resources, `/root/full_backup.sh` и systemd host state не затрагивались. Установка и активация механизма остаются owner-only действием.

Ветка: `codex/2026-08-16-l9s-wave-4`. Коммиты: `dc0635e9`, `60aec41f`, `bccb4228`. Финальная приёмка после review fixes: 58/58 Jest suites, 419/419 tests, 4/4 Python unittest; сборка frontend/backend/orchestrator; docs 63/63; брендовый скан 0 unexplained / 7 allowlisted; root restore proof PostgreSQL 17.10 dump 1s/restore 2s; reviewer proof dump 2s/restore 2s; process verification и `git diff --check` зелёные. Независимый reviewer — `gpt-5.5`, потому что Sol писала c6k.15, а цель запрещает той же модели проверять код своей волны.

### Premortem и выполненные условия

Вердикт: **GO WITH CONDITIONS**. Telegram-путь меняет persistent state и конкурентное владение, backup-путь — восстановление данных и host runtime contract. Прямые зависимости: Telegram consumer → lease/receipt Prisma models → курсор и DB-метрики; backup scripts → production compose PostgreSQL → product, `temporal`, `temporal_visibility` databases → host scheduler/operator.

- Блокирующие условия Telegram: без raw SQL; durable attempt state обновляется только под проверенным lease owner/update id; receipt transaction остаётся единственным idempotency boundary; тест создаёт новый service instance и доказывает продолжение счётчика после restart. Clock-skew решение допустимо оставить на process clocks только с поведенческим доказательством post-poll/mid-batch recheck и unique-receipt rollback.
- Блокирующие условия backup: никакого production-host обращения и никакого существующего volume; dump не раскрывает пароль в argv/log; включает globals и все три базы; checksum/manifest проверяются до restore; восстановление идёт только в новый disposable local PostgreSQL и сверяет sentinel data. Измеряется фактическое время dump+restore.
- Поздний вред и executor error: stale owner не должен увеличивать чужой retry state; частичный/пустой dump не должен считаться успешным; имя compose project/volume нельзя угадывать; документация не должна выдавать repository-ready механизм за уже установленный host schedule.
- Recovery: Telegram correction откатывается кодом, additive Prisma state можно безопасно оставить до roll-forward; локальный restore удаляет только созданный тестом disposable container/volume. Установка на host остаётся отдельным owner-authorized действием.

## Волна 3 — системные UI-примитивы

- `content-factory-next-rcg.2`: принят обязательный geometry guard. После независимого ревью scanner расширен до всех `px` внутри AST string/template arbitrary payloads, включая compound, decimal и signed значения. Точный baseline — 1 226 вхождений в 517 группах и 148 файлах; +17 ранее невидимых активных значений и −12 comment-only совпадений записаны как расширение охвата, не погашение долга. Новое или выросшее нарушение падает с именем файла и значением, а уменьшившийся долг требует сократить реестр.
- Независимая root-мутация `w-[7px]` подняла счётчик до 1 225 и ожидаемо уронила guard; после очистки `design.guard` снова прошёл 9/9.
- `content-factory-next-rcg.1`: три колонки страницы агентов используют один `OpeningBand` из `@contentfactory/react`; он владеет `h-16`, вертикальным центрированием и ритмичным `mb-4`, а consumer-файлы больше не называют `64px`. Долг честно уменьшен 1 224→1 222. Root-мутация одной chat-колонки ожидаемо уронила focused guard; финально 11/11 targeted tests и frontend TypeScript зелёные.
- `content-factory-next-rcg.3`: `PageShell`, `PageHeader`, `Panel` и 4px spacing scale экспортированы из `@contentfactory/react/layout`; app-local `Panel/PageHeader` стали тонкими re-export без второй реализации. Admin users/errors применяют все три примитива. Долг уменьшен 1 222→1 221; root-мутация одной страницы ожидаемо уронила guard, финально 12/12 targeted tests и frontend TypeScript зелёные.
- Подготовительный аудит `rcg.4` принят: 100 raw buttons, 4 selects и 9 textareas сведены в 58 точных file+tag групп; 55 контролов можно мигрировать напрямую, остальные разделены на intrinsic, adapter, semantic и missing-capability без механического переписывания.
- `content-factory-next-rcg.4`: 74 из 113 raw controls мигрированы в shared `Button`, `Select` и `Textarea`; точный shrink-only AST ledger хранит оставшиеся 39 (21 semantic, 13 adapter, 5 intrinsic). Новый raw control и stale allowance доказанно валят guard. Shared Button сохраняет доступное имя при loading, typed icon-only mode, ref и caller-owned geometry; variant audit после независимого ревью охватывает default primary, legacy secondary, state/important prefixes и dynamic literal branches. Четыре скрытых caller-owned color role исправлены. Для 21 choice-control открыт bounded follow-up `content-factory-next-rcg.5`.

Ветка: `codex/2026-08-16-l9s-wave-3`. Полная приёмка на `7079e256`: 56/56 Jest suites и 407/407 tests, 4/4 Python unittest, сборка frontend/backend/orchestrator, брендовый скан 0 unexplained / 7 allowlisted, process verification и `git diff --check` зелёные. Первое независимое ревью вернуло два P2; после исправлений повторное ревью — ACCEPT, 8 suites / 79 tests, Button conflicts `[]`, geometry ledger 1 226/517/148 без added/stale.

## Волна 1 — права и вход

- `content-factory-next-ao3`: роль внутри организации проверяется даже без Stripe; отсутствие биллинга снимает только тарифные ограничения.
- `content-factory-next-eh3`: глобальный DTO whitelist удаляет лишние поля, а намеренно произвольные payload-поля и нужные optional-строки явно размечены.
- `content-factory-next-yhx`: оба пользовательских URL проходят общую HTTPS/SSRF-проверку на каждом переходе с пределом пять redirects.
- `content-factory-next-f36`: query-session `loggedAuth` действует только на `/provider/*`.
- `content-factory-next-d08`: enterprise-создание пользователя уважает общий режим ручного одобрения.

Ветка: `codex/2026-08-16-l9s-wave-1`.

Основные коммиты: `ce78e401`, `b672f04b`, `4b1a1672`, `168ad113`, `60c74a69`, `f15f3817`, `e664ed65`, `498d8eaf`, `2b798c48`. Отдельная синхронизация с обновившимся `main` сохранила параллельный пользовательский коммит без смешивания с task-коммитами.

Приёмка после всех исправлений:

- `pnpm test`: 49/49 Jest suites, 363/363 tests; Python unittest 4/4.
- `pnpm run build`: frontend, backend и orchestrator собраны.
- backend `tsc --noEmit`: 0 ошибок.
- брендовый скан: 0 unexplained, 24 allowlisted.
- `git diff --check`, stage artifact validation и `run_process_verification.sh`: OK.
- независимое ревью: ACCEPT, P0–P3 findings отсутствуют; первоначальный P2 по SSRF redirects закрыт.

## Волна 2 — следы апстрима и SDK

- `content-factory-next-4ug`: удалены унаследованные extension workflows, мёртвый submodule, funding, чужие issue/advisory routes, credential-shaped Resend sample, extension key и CodeRabbit config; owner-level GitHub settings отложены в `woy`.
- `content-factory-next-ry5.7`: SDK экспортирует `ContentFactory`, очищен от upstream-имени/адреса/автора и включён в брендовый сканер без нового allowlist.
- `content-factory-next-ry5.8`: все 35 social providers охраняются от чужого redirector, а фактический `generateAuthUrl()` пяти провайдеров доказан точным callback от `FRONTEND_URL`; локальный HTTPS-tunnel runbook обновлён.
- `content-factory-next-4w5`: fetch provenance upstream сохранён, локальный push URL равен `DISABLED`, безопасная настройка новой машины описана.
- `content-factory-next-527`: `ka_ge` и `en` имеют по 1165 ключей (missing 0, extra 0); FAQ всех 16 локалей отражает AGPL-3.0 и не выдаёт upstream за исходники Content Factory.

Ветка: `codex/2026-08-16-l9s-wave-2`.

Основные коммиты: `430e8b9e`, `5aae520b`, `52d32f13`, `bdbc22b3`, `00415fb9`, `212fd018`, `a426aee5`.

Приёмка после всех исправлений:

- `pnpm test`: 52/52 Jest suites, 390/390 tests; Python unittest 4/4.
- `pnpm run build`: frontend, backend и orchestrator собраны.
- SDK `tsc --noEmit` и `tsup`: OK.
- docs check: 62/62 files; locale parity: 1165/1165, missing 0, extra 0.
- брендовый скан: 0 unexplained, 7 allowlisted.
- `git diff --check`, stage artifact validation и `run_process_verification.sh`: OK.
- независимое ревью: итоговый ACCEPT после исправления AGPL FAQ и поведенческого OAuth guard; 10/10 targeted tests.
- отдельно открыт P1 `content-factory-next-9jv`: owner должен опубликовать Corresponding Source точного deployment и назначить Content Factory-owned URL.

## Финальный closeout

Каноническая release-проверка этапа запускается один раз через `python3 scripts/orchestration/run_stage_closeout.py --stage content-factory-next-l9s --level release`. Она использует только настроенные `release_commands`: сборку трёх приложений, весь test suite, brand scan, docs check, process verification и `git diff --check`; receipt хранится в `.codex/stages/content-factory-next-l9s/acceptance-receipt.json`.

`docs-reviewed: updated - добавлены PostgreSQL backup/recovery runbook и локальная OAuth tunnel-проверка; configuration/auth docs, SDK README и локали приведены к принятому поведению.`

`project-index: updated - добавлен стабильный вход в repository-owned PostgreSQL backup/recovery и owner-only host activation.`

`graph-reviewed: updated - Graphify 0.9.14 локально перестроил code graph на принятом local main без LLM/API: 7052 nodes, 16447 edges; focused query/affected TelegramUpdatesService выполнены, excluded roots отсутствуют, query logging и Graphify git hooks выключены.`
