---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-C
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: второй ряд кругов окна поста (SelectCurrent)
bounded_acceptance: tests/design.guard.test.cjs, tests/foundation.test.cjs, tests/design.typography.test.cjs, tsc frontend
non_goals:
  - клавиатурная доступность самих вкладок канала (существующий долг, сырые div)
  - пункт 1 (снят волной окна поста)
evidence:
  - jest-design-guard
  - jest-foundation
  - tsc-frontend
task_id: content-factory-next-fn33.76
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: подписи и цвет в одном компоненте окна
repo: content-factory-next
branch: worktree-agent-a4826acfd11be4024
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4826acfd11be4024
write_zone:
  - apps/frontend/src/components/new-launch/select.current.tsx
  - apps/frontend/src/components/new-launch/compose.copy.ts
  - tests/design.guard.test.cjs
  - tests/foundation.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
success_criteria:
  - второй ряд называет себя, крестик говорит, что он делает
  - крестик набран цветами поверхности, а не тревоги
  - реестры только сократились
selected_docs:
  - docs/prompts/compose-modal-design-brief.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-C
depends_on_streams:
  - none
parallel_decision: parallel
status: blocked
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: правка подписей и цвета внутри уже принятого решения владельца
verification:
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/design.typography.test.cjs tests/raw-control.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/select.current.tsx
  - apps/frontend/src/components/new-launch/compose.copy.ts
  - tests/design.guard.test.cjs
  - tests/foundation.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
explicit_defers:
  - content-factory-next-fn33.76 п.2 (красный счётчик до набора) — файл вне зоны записи
  - content-factory-next-fn33.76 п.4 («Что применено»/«Выбрать») — файлы вне зоны записи
  - content-factory-next-fn33.76 п.5 («Повторять публикацию каждые…») — файл вне зоны записи
---

# Summary

Сделан пункт 3. Второй ряд кругов — вкладки настроек уже выбранных каналов —
получил имя (`role="group"` + `aria-label`: «Выбранные каналы: откройте канал,
чтобы настроить его отдельно»), а крестик — подпись и подсказку «Убрать канал
из поста». Красная заливка ушла: 8-пиксельный кружок цвета ошибки стал
16-пиксельной кнопкой поверхности (`bg-cf-surface-raised`, граница
`cf-border-strong`, знак `×` токеном `cf-caption`), доступной с клавиатуры
(`role="button"`, `tabIndex`, Enter/Space). Слова — в `compose.copy.ts`, два
языка, как требует заказ дизайна для этого окна.

Пункты 2, 4 и 5 не сделаны: каждый живёт в файле вне зоны записи этого потока.

# Scope / Routing

Зона записи выше. Три пункта упираются в чужие файлы:

- п.2 (счётчик символов красный до набора) — `apps/frontend/src/components/launches/information.component.tsx`;
- п.4 («Что применено» / «Выбрать» не говорят, что выбирают) — `apps/frontend/src/components/brand-voice/voice-copy.ts` и `voice-ribbon.tsx`; лента с 04.09 живёт в генераторе, а не в окне поста;
- п.5 («Повторять публикацию каждые…») — `apps/frontend/src/components/launches/repeat.component.tsx`, который в этой же волне уже переписан под общий примитив другим потоком.

Реестры правились только на сокращение: `text-[8px]` и по одной записи `1px` и
`3px` за `select.current.tsx` ушли, файл убран из списков `text-white` и сырой
палитры Tailwind в `design.guard.test.cjs` и `foundation.test.cjs`. Метаданные
`rootCoverageExpansion` пересчитаны на те же 2.

# Verification

Целевые наборы jest и `tsc --noEmit` фронтенда — зелёные. Живой прогон не
проводился: стенд главной копии собран из другого дерева.

# Delivery / Cleanup

Возвращено корню; три пункта требуют расширения зоны записи или другого
потока.

# Risks / Follow-ups / Explicit Defers

Вкладки канала и кнопка «все каналы» остаются сырыми `div` с `onClick` — с
клавиатуры недостижимы. Примитива под значок 16px в продукте нет (`Button` и
`ControlButton` держат высоту 32/40), поэтому крестик остался `div` с ролью;
завести такой примитив — отдельная заявка, а не третья копия.

---

# Продолжение 05.09.2026 (stream-C2, волна «зачистка»)

Ветка `worktree-agent-a8a7f4e3820f01741` от `a0c1ca82`. Сделаны пункты 2, 4, 5;
пункты 1 и 3 закрыты раньше и не трогались.

**Пункт 2 — счётчик символов.** У плашки теперь три состояния, а не два.
Третье, `pristine`, — черновик, к которому ещё не притронулись: ни картинки,
ни символов. Оно набрано границей `cf-border-control` и приглушённым
`cf-ink-muted`, без восклицательного знака и без красной заливки; настоящее
превышение и снятие ссылок остались красными. Состояние стоит рядом с
`isValid`, а не вместо него: сохранять пустой пост по-прежнему нельзя, и
кнопки внизу об этом знают — молчит ровно плашка. Подсказка в подвесе («нужен
хотя бы один символ или картинка») из красной стала приглушённой: это условие,
а не ошибка. Три почти одинаковых блока «число/предел» свелись к одному
выражению `counterText`, и без канала он показывает само число набранного,
чтобы плашка не стояла пустой. Состояние читается снаружи атрибутом
`data-compose-counter`.

**Пункт 4 — лента голоса.** `ribbonWhatApplied` → «Аватар: что применено» /
«Avatar: what applied», `ribbonChoose` → «Выбрать аватар» / «Choose avatar».
Слово «аватар» стояло только строкой выше, и пара кнопок не говорила, что
именно выбирают. `voice-ribbon.tsx` не менялся: разметка не при чём, вся
разница была в словах.

**Пункт 5 — повтор публикации.** Кнопка подписана как кнопка выбора:
«Повтор: не повторять» до выбора и «Повтор: Неделя» после, вместо
«Повторять публикацию каждые…», которое читалось как незаполненное поле.
Пункт списка «Отмена» стал «Не повторять» — он снимает повтор, а не закрывает
список. Примитив `Menu` не тронут. `aria-label` с кнопки снят: видимый текст
теперь полностью её называет, дублировать его в метке значило бы дать
кнопке два разных имени.

Три новых ключа (`repeat_post_button`, `repeat_post_none`,
`repeat_post_none_option`) — во всех 16 локалях, ru по-русски, остальные
по-английски, с записью в `tests/locale-untranslated-allowlist.json` для семи
нелатинских.

Реестры только сокращались: `text-[10px]` и `font-[600]` в
`information.component.tsx` с 2 до 1, `10px` в геометрии с 2 до 1,
`text-white` в `foundation.test.cjs` с 3 до 2; секционные и общие итоги обоих
реестров и `rootCoverageExpansion` пересчитаны.

## Verification (C2)

Новый набор `tests/compose-quiet-controls.test.cjs` до правок красный: 6 из 7
проверок падали (счётчик отдавал `invalid` на пустом черновике, кнопка повтора
печатала «Repeat Post Every...», лента не произносила «аватар»). После правок
7 из 7 зелёные.

- `pnpm exec jest tests/compose- tests/brand-voice. tests/locale-` — 57 наборов, 945 проверок, зелено.
- `pnpm exec jest tests/design.guard tests/design.typography tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated` — 62 проверки, зелено.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — без ошибок.
- `tests/raw-control.guard.test.cjs` красный и до этого потока (`assistant.popup.tsx: button occurs 2, allowed 0`) — чужая поверхность, не чинилось.

## Explicit Defers (C2)

В состоянии «нет аватара» с уже заведёнными аватарами лента показывает две
кнопки — «Сменить аватар» (выбор) и «Выбрать аватар» (действие ленты). Это
видно только там, где аватары есть, и убирать вторую кнопку — решение о
поведении ленты, а не о словах; оставлено заявкой.
