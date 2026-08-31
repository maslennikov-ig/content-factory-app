# Target

> Namespace note (2026-08-14): examples use the current
> `@contentfactory/*` contract; namespace migration remains outside this
> historical design task.

Target: Opus 5 в Claude Code CLI со shell, Git, Beads, Graphify и браузерной автоматизацией. Новое контекстное окно, чистая сессия.

# Audience

Audience: владелец Content Factory и следующий агент. Ты — ведущий frontend engineer, работаешь в worktree `/home/me/code/content-factory-next-design` на ветке `design/desert-lab`.

# Goal

Перенеси дизайн-систему «desert-lab» из артефактов в продукт: значения токенов обеих тем, вторая гарнитура, знак `Cf 98`, примитивы компонентов, светлая навигация, тест контраста и страж стиля.

Полная спецификация — `docs/design/desert-lab-implementation-spec.md`. Она главнее этого промпта во всём, что касается значений и порядка. Числа не пересочиняются: они уже проверены расчётом.

# Success Criteria

- Обе темы получили значения из `docs/design/desert-lab/tokens.css`; ни одно имя токена не добавлено и не удалено.
- `tests/design.contrast.test.cjs` проверяет все 47 пар и проходит без нарушений.
- JetBrains Mono вендорена как Geologica; `label-sm` и `caption` моноширинные; сборка не ходит в сеть за шрифтом.
- Знак `Cf 98` читается от 16px до 128px в обеих темах, доступное имя `Content Factory` везде.
- Примитивы имеют полный набор состояний в обеих темах; фокус виден всегда, включая акцентную кнопку.
- Светлая навигация не содержит невидимых элементов, оставшихся от тёмного рельса.
- Страж стиля падает на намеренном нарушении и не падает на текущем репозитории.
- Ни один файл параллельной работы не изменён.

# Context

Documentation: use `orch-prompts docs-resolve` для version-sensitive поведения `next/font/local`, Next.js и Tailwind перед изменением подключения шрифта и конфигурации. Цвета, размеры и правила дизайна берутся только из локальных артефактов и внешней документации не требуют.

До начала прочитай: `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`, `docs/design/desert-lab-implementation-spec.md`, `docs/design/desert-lab/` целиком, `docs/design/component-authoring-rules.md`, `.codex/handoff.md`, `.codex/project-index.md`. Beads — единственный источник статуса: эпик и его дочерние задачи.

Ты в отдельном worktree. В основном дереве `/home/me/code/content-factory-next` параллельно идёт epic `content-factory-next-ja3` — Telegram pipeline, крупное незакоммиченное изменение. Твоя ветка вливается merge-ем позже; чужую работу ты не видишь и не трогаешь.

Дизайн-проект в Claude Design тебе недоступен и не нужен: всё перенесено в `docs/design/desert-lab/`.

# Execution

Этапы идут по порядку, каждый закрывается отдельной задачей Beads с acceptance evidence.

1. **Токены.** Значения `--cf-*` в `apps/frontend/src/app/colors.scss` из `tokens.css`, включая `backdrop` и `overlay-shadow`. Мост к legacy-именам не трогать. Корневой `DESIGN.md` — из `desert-lab/design-system.md`, приведя frontmatter к формату репозитория без изменения значений. Новый ADR: dark-first, светлая навигация, знак, вторая гарнитура. Раздел 5 интерфейсной спецификации — в соответствие.
2. **Тест контраста.** `tests/design.contrast.test.cjs` парсит `colors.scss` и таблицу `desert-lab/contrast-pairs.md`, считает по формуле оттуда же, проверяет 47 пар и наличие каждой роли в обеих темах.
3. **Моношрифт.** Скачать переменный JetBrains Mono с релиза `JetBrains/JetBrainsMono`, положить в `apps/frontend/src/styles/fonts/jetbrains-mono/` с `OFL.txt` и `SOURCE.md` (версия, SHA-256). `appMono` в `fonts.ts`, `fontFamily.mono` в tailwind, ADR-0007 дополнить. Подключение переменной в трёх root layout — последним шагом этапа и после rebase.
4. **Знак.** `cf-mark.tsx` — карточка элемента по измерениям `desert-lab/mark.md`, на CSS с моноширинной переменной. `wordmark.tsx` сохраняет API. Иконки в `public/` — контурами, цвета из тёмной темы. Аватары каналов — тот же приём.
5. **Примитивы.** Восемь групп из спецификации: кнопки, поля, селект и переключатели, навигация, статусы, панели и таблица, слои, состояния пустого/ошибки/ограничения.
6. **Светлая навигация.** Снять инверсию иконок, перевести цвета навигации на `navigation-text`, перепроверить всё, что рисовалось под тёмный рельс.
7. **Страж.** Расширить `tests/foundation.test.cjs`: hex-литералы, `text-white`, `customColor*`, гарнитура `label-sm` и `caption`. Список исключений явный и обоснованный.

На каждом этапе — focused red-green, снимки экрана в обеих темах, обновление Beads и артефакта.

# Constraints

- Не трогай `apps/backend/**`, `libraries/nestjs-libraries/**`, `libraries/react-shared-libraries/src/translation/**`, `apps/frontend/src/components/{agents,autopost,launches,new-launch}/**`, `settings/ai-provider.component.tsx`.
- Мокапы экранов — эталон стиля, не техзадание. Структура, поведение, маршруты и состав полей не переделываются. Поля из мокапов, которых нет в продукте, не появляются.
- Никакого global replace. Имена токенов, `@contentfactory/*` imports, env keys, Prisma и Temporal идентификаторы, provider slugs и публичные контракты не переименовываются.
- Значения из `tokens.css` переносятся дословно. Подгонять цвет на глаз запрещено.
- Не добавляй новых семантических ролей токенов без отдельного решения.
- Внешняя загрузка шрифтов запрещена; только локальные файлы под OFL с кириллицей.
- Не выполняй push, merge в основную ветку, deploy, real OAuth, публикацию, платный вызов и рассылку.
- Источник визуального направления не называется нигде: ни в коде, ни в документах, ни в коммитах.
- Не оставляй `TODO/FIXME/HACK/XXX`; реальный defer оформляй в Beads.

# Verification

Проверь 1440, 1024, 768 и 390px, обе темы, 200% zoom, keyboard-only, возврат фокуса из диалога, reduced motion, длинные RU и EN строки, отсутствие горизонтального переполнения. Сними вход, календарь, редактор, каналы и настройки в обеих темах.

Контраст: обычный текст и placeholder не ниже 4.5:1, крупный текст и границы управляемых элементов не ниже 3:1 — расчётом, а не на глаз.

Перед закрытием эпика выполни:

```
pnpm run build
pnpm test
git diff --check
scripts/orchestration/run_process_verification.sh
```

Обнови Graphify после принятого изменения и запиши `graph-reviewed`.

# Output

В финале сообщи: результат каждого этапа, изменённые файлы по зонам, реально прошедшие команды, пути к снимкам, вес добавленных шрифтовых ресурсов, оставшийся долг по hex-литералам и `customColor*`, и что именно нужно сделать при merge в основную ветку.

# Stop

Остановись и задай один конкретный вопрос, если:

- перенос требует изменить структуру экрана или добавить поле, которого нет в продукте;
- значение из `tokens.css` не проходит порог контраста в реальном сочетании, не описанном в 47 парах;
- подключение второго шрифта конфликтует с изменениями параллельной работы в root layout;
- нужен push, merge, внешняя запись или расширение полномочий.

При техническом блокере не объявляй завершение: зафиксируй его в Beads и дай точное следующее действие.
