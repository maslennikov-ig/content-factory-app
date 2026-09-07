---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z6_compose_window
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно поста из календаря, боковой панели, меню канала и генератора; клетка таблицы заготовок (поток-сосед)
public_facade: apps/frontend/src/components/new-launch/compose.modal.ts
bounded_acceptance: стражи дизайна, локалей и окна поста плюс tsc фронтенда
non_goals:
  - редактор текста и панель начертаний (решение владельца 06.09.2026)
  - предпросмотры площадок `new-launch/providers/**` (то же решение)
  - таблица заготовок и её клетка (соседний поток)
  - двери окна вне `launches/**`: наборы, помощник, голос бренда, вход одной мыслью
evidence:
  - compose_and_design_guards_green
  - frontend_typecheck_clean
  - full_jest_two_known_failures_outside_write_zone
task_id: content-factory-next-tu3k.9.11
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 07.09.2026
milestone: окно поста на токенах продукта и один объект флагов
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: перекраска живого окна с двусторонними реестрами долга — молчаливая ошибка здесь видна только на боевом
repo: content-factory-next
branch: worktree-agent-aed0f3ba25a728607
base_branch: wave/pieces-2026-09-07
base_commit: 2ae8e461
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aed0f3ba25a728607
write_zone:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/compose.modal.ts
  - apps/frontend/src/components/launches/**
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/design.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - docs/design/desert-lab/compose/README.md
success_criteria:
  - один объект флагов и один хук открытия окна; литералов флагов в `launches/**` не осталось
  - рамка, полосы, подвал, кнопки, крестик и прокрутка окна — на `cf`-токенах
  - крестик работает с клавиатуры и имеет имя
  - «Save Set» переведён; шестнадцатеричных цветов в окне нет
  - послабления, переставшие быть нужными, сняты, а не оставлены
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
  - docs/design/desert-lab/compose/README.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: волна tu3k.9
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт в worktree, не сливалась и не пушилась; в worktree лежит символьная ссылка node_modules на общий чекаут (в .gitignore, в коммит не попала)
risk_level: medium
risk_tags:
  - ui
  - shared-primitive
affected_surfaces:
  - ui
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: добавлен раздел «Где кончается дизайн-система в окне поста» с решением владельца 06.09.2026
verification:
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.typography.test.cjs tests/design.contrast.test.cjs tests/compose-window-only-useful.test.cjs tests/i18n.ui-literals.test.cjs tests/compose-quiet-controls.test.cjs tests/compose-read-only.test.cjs tests/compose-needs-channel.test.cjs": passed
  - "pnpm exec jest tests/branding.test.cjs tests/locale-key-set.test.cjs": passed
  - "pnpm exec jest (весь набор)": failed_outside_write_zone
changed_files:
  - apps/frontend/src/components/new-launch/compose.modal.ts
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/launches/new.post.tsx
  - apps/frontend/src/components/launches/menu/menu.tsx
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/launches/intake.door.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/design.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - docs/design/desert-lab/compose/README.md
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-tu3k.9.11.md
explicit_defers:
  - два набора вне зоны записи красные и требуют по одной строке правки; см. «Blockers / Owner input»
  - двери окна поста вне `launches/**` (наборы, помощник, голос бренда, вход одной мыслью, отдельная страница окна) по-прежнему открывают его своим литералом; переводить их на хук должен владелец соответствующих файлов
  - `voice-materials.adapter.ts` держит свою копию флагов (`EDITOR_MODAL`); её место — `COMPOSE_MODAL_OPTIONS`, но файл вне зоны
  - `btnSub` в окне оставлен: это не цвет, а сцепка (`.btnSub:disabled + button {display:none}`), которой всплывающая панель «Опубликовать сейчас» узнаёт, что главная кнопка выключена
  - `text-[20px]` и шесть чисел геометрии остались в реестрах за панелью настроек канала и шириной панели «Опубликовать сейчас»
---

# Summary

Окно поста перекрашено ровно по границе, которую провёл владелец 06.09.2026:
рамка, обе полосы, подвал, кнопки, крестик и полосы прокрутки — на токенах
продукта; редактор текста и предпросмотры площадок не тронуты.

Флаги открытия окна перестали быть литералом. `COMPOSE_MODAL_OPTIONS` и
`useOpenPostEditor()` живут в `apps/frontend/src/components/new-launch/compose.modal.ts`,
и все двери в `launches/**` — календарь (правка поста и копия, пустая клетка),
«Чистый лист» в боковой панели, меню канала, генератор — открывают окно одним
вызовом. Клетка таблицы заготовок откроет то же самое окно тем же вызовом.

Крестик закрытия стал кнопкой: у неё есть имя, фокус и клавиатура. Английский
хвост «Save Set» переведён ключом, который в словаре уже лежал и просто не
использовался.

# Scope / Routing

Зона записи соблюдена. Ни `content-intelligence/**`, ни `brand-voice/**`, ни
бэкенд, ни `libraries/nestjs-libraries/**`, ни Beads не тронуты.

## Сигнатура хука

```ts
export const useOpenPostEditor: () => (input: OpenPostEditorInput) => Promise<void>;

export type OpenPostEditorInput = {
  group?: string;            // группа существующего поста; окно само заберёт /posts/group/:group
  duplicate?: boolean;       // открыть копию, а не сам пост
  date?: dayjs.Dayjs;        // без неё берётся ближайший свободный слот
  integrations: Integrations[];   // единственное обязательное поле
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  focusedChannel?: string;
  onlyValues?: AddEditModalProps['onlyValues'];
  set?: AddEditModalProps['set'];
  researchSources?: AddEditModalProps['researchSources'];
  contentIntelligenceProvenance?: AddEditModalProps['contentIntelligenceProvenance'];
  draftGap?: AddEditModalProps['draftGap'];
  dummy?: boolean;
  addEditSets?: AddEditModalProps['addEditSets'];
  customClose?: () => void;
  mutate?: () => void;
  reopenModal?: () => void;  // по умолчанию — тот же самый вызов
};
```

Хук взял на себя не только флаги: запрос группы поста, поиск свободного слота,
сужение списка каналов до канала открытого поста и подъём
`ExistingDataContextProvider`. Раньше эти четыре шага каждая дверь писала
руками, и календарь был единственной дверью, которая писала их полностью.

Для клетки таблицы заготовок этого довольно:

```ts
const openPostEditor = useOpenPostEditor();
openPostEditor({ group: piece.group, integrations, mutate });
```

## Замена токенов в `manage.modal.tsx`

Восемнадцать мест, все — переименование в один шаг: старые псевдонимы
`colors.scss` уже указывали на переменные `--cf-*`, поэтому цвет на экране не
изменился ни в одном из них.

| было | стало | что это |
| --- | --- | --- |
| `bg-newBgColorInner` | `bg-cf-surface` + `border border-cf-border` | рамка окна |
| `border-newBorder` (×2) | `border-cf-border` | разделитель колонок, граница подвала |
| `bg-newBgColor` (×3) | `bg-cf-canvas` | обе верхние полосы, фон настроек канала |
| `scrollbar-thumb-newColColor` (×2) | `scrollbar-thumb-cf-border-strong` | ползунки прокрутки |
| `scrollbar-track-newBgColorInner` (×2) | `scrollbar-track-cf-surface` | дорожки прокрутки |
| `scrollbar-thumb-newBgColorInner` | `scrollbar-thumb-cf-border-strong` | ползунок панели настроек |
| `scrollbar-track-newColColor` | `scrollbar-track-cf-surface-subtle` | дорожка панели настроек |
| `bg-newSettings` | `bg-cf-surface-subtle` | панель настроек канала |
| `text-textColor` (×3) | `text-cf-ink` | текст настроек, окно кода |
| `border-textColor`, `border-white` | накладка примитива `Button` | два самодельных вращающихся кружка |
| `text-[#A3A3A3]` | `text-cf-ink-muted` | единственный шестнадцатеричный цвет файла |
| `text-[15px] font-[600]` (×4) | шкала действия примитива `Button` | подписи кнопок подвала |
| `text-[14px] font-[600]`, `text-[14px] font-[500]` | `cf-label-md`, `cf-body-sm` | шапка и тело настроек канала |

Две полосы прокрутки в окне были покрашены наоборот друг другу: у одной
ползунок был светлее дорожки, у другой темнее. Теперь правило одно: ползунок —
`border-strong`, дорожка — та поверхность, на которой полоса лежит.

## Снятые послабления

- `tests/design.guard.test.cjs`, список `HEX_ALLOWED` — строка
  `manage.modal.tsx` убрана: шестнадцатеричных цветов в файле не осталось.
- `tests/design.guard.test.cjs`, список `RAW_PALETTE_ALLOWED` — та же строка
  убрана: `border-white` ушёл вместе с самодельной накладкой загрузки.
- `tests/design-typography-allowlist.json` — у `manage.modal.tsx` сняты
  `font-[500]`, `font-[600]`×5, `text-[14px]`×2, `text-[15px]`×4; итог реестра
  749 → 737.
- `tests/design-geometry-allowlist.json` — сняты `14px`×2 и `15px`×4; итог
  1002 → 996, живые поля `priorTotal` и `combinedTotal` пересчитаны, в
  `classification` добавлена строка о причине.

Послабления, которые остались и остаться должны, — редактор
(`new-launch/editor.tsx`) и предпросмотры площадок: их сужать нечем, пока
владелец не решит перекрашивать и их. Причина записана в
`docs/design/desert-lab/compose/README.md`.

# Verification

Node 22.23.2, из корня worktree.

- `tsc --noEmit -p apps/frontend/tsconfig.json` — ноль ошибок.
- Восемь наборов из задания — 8 наборов, 78 тестов, зелёные.
- `tests/branding.test.cjs`, `tests/locale-key-set.test.cjs` — зелёные после
  того, как новые ключи легли во все шестнадцать языков (эти два набора
  требуют полного совпадения наборов ключей).
- Весь `jest` — 392 набора, 4875 тестов: 4870 зелёных, 1 пропущен, 4 красных
  в двух наборах вне зоны записи (см. ниже). До правок весь набор был зелёным.

Стенд и браузер не запускались, рецензент не звался — по слову владельца
«скорость важнее тестов и UX-проверок».

# Blockers / Owner input

Два набора вне зоны записи проверяют написание, которое сведение флагов
убрало. Оба проверяют факт, который остался верным, — только теперь он
записан один раз, а не в каждой двери. Правка по строке в каждом:

1. `tests/content-intelligence.consumer-frontend.test.cjs:379`
   `expect(source('generator')).toMatch(/contentIntelligenceProvenance=/);`
   Генератор передаёт происхождение не JSX-свойством, а полем объекта:
   `contentIntelligenceProvenance,`. Достаточно `/contentIntelligenceProvenance[=,]/`.

2. `tests/brand-voice.materials-tab.test.cjs:761`
   `expect(source('calendar')).toContain("id: 'add-edit-modal'");`
   Календарь больше не пишет идентификатор окна сам — его пишет
   `COMPOSE_MODAL_OPTIONS`. Проверять стоит там:
   `expect(source('compose')).toContain("id: 'add-edit-modal'")`, где
   `compose` — `apps/frontend/src/components/new-launch/compose.modal.ts`.

Оба файла принадлежат чужим поверхностям (`content-intelligence/**` и
`brand-voice/**`), поэтому поток их не трогал.

# Delivery / Cleanup

Ветка `worktree-agent-aed0f3ba25a728607`, один коммит, не сливалась и не
отправлялась. В worktree лежит символьная ссылка `node_modules` на общий
чекаут — без неё в worktree нечем было запускать jest и tsc; ссылка в
`.gitignore` и в коммит не попала, удалить её можно в любой момент.

# Risks / Follow-ups / Explicit Defers

- Окно поста открывается ещё из пяти мест вне `launches/**`: наборы
  (`sets/sets.tsx`), помощник (`agents/agent.chat.tsx`), отдельная страница
  (`standalone-modal/standalone.modal.tsx`), материалы и бриф голоса бренда,
  вход одной мыслью (`content-intelligence/intake/intake.container.tsx`).
  Каждое держит свою копию флагов. Пока копии живы, разойтись они всё ещё
  могут — просто теперь есть один образец, к которому их приводить.
- `voice-materials.adapter.ts` завёл собственный `EDITOR_MODAL` — ту же
  девятку флагов под своим именем. Это второй источник той же правды.
- Значения `create_new_post` переписаны во всех шестнадцати языках: набор
  `locale-key-set` требует полного совпадения ключей, а оставить в немецком
  «Beitrag erstellen» рядом с русским «Чистый лист» значило бы назвать одну
  кнопку двумя разными вещами.
- `text-[20px]` в `manage.modal.tsx` остался и в реестре, и в файле: он стоит
  в диалоге «пост уже опубликован, что делать», а не в перекрашиваемой части
  окна.
