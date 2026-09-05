---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-E-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост», медиатека
public_facade: n/a
bounded_acceptance: jest-media-window-language
non_goals:
  - остальные подписи словаря @uppy/dashboard: переопределены только три, что видны в полосе 46px
  - множественные строки Uppy («Uploading %{smart_count} files») — им нужна своя функция склонения
evidence:
  - jest-media-window-language
task_id: content-factory-next-fn33.28.15
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: окно поста говорит на одном языке
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: подпись рисует чужая библиотека, поэтому решение — про её договор, а не про разметку
repo: content-factory-next
branch: worktree-agent-a04a06f6c9f480bbb
base_branch: wave/compose-2026-09-04
base_commit: 411ed4bf0e7c8f29a40f756970a3fbfcde11bdb1
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a04a06f6c9f480bbb
write_zone:
  - apps/frontend/src/components/launches/ai.image.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - подпись кнопки картинки — один ключ локали, а не склейка перевода с английским словом
  - полоса загрузчика берёт подписи из локали приложения
  - подстановка %{browseFiles} цела во всех шестнадцати переводах
selected_docs:
  - "orch-prompts docs-resolve --package @uppy/dashboard --version 4.4.3: status fallback-needed (L1 отсутствует, 404)"
  - node_modules/@uppy/dashboard@4.4.3 (прочитаны lib/locale.js и Dashboard.d.ts — версия из pnpm-lock)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - stream-D-compose-2026-09-04
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет; изменены только подписи
verification:
  - "pnpm exec jest jest-media-window-language (до правки)": failed
  - "pnpm exec jest jest-media-window-language": passed
  - "pnpm exec jest jest-locale-key-set jest-locale-translated": passed
  - "pnpm exec jest jest-design-guard jest-design-contrast jest-foundation": passed
  - "pnpm exec jest jest-media-box-opening jest-media-upload-limit jest-media-upload-failure": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/launches/ai.image.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - jest-media-window-language
explicit_defers:
  - none
---

# Summary

Две английские подписи в окне поста, и обе по разным причинам.

«ИИ Image» собиралась из переведённого `t('ai', 'AI')` и зашитого рядом слова
`Image`: половина строки переводилась, половина нет. Теперь это один ключ
`ai_image` целиком, поэтому склеить два языка больше нечем.

«browse files» рисует не наша разметка, а `@uppy/dashboard` из своего словаря,
до которого перевод приложения не дотягивается. Единственное место, где Uppy об
этом спрашивает, — `locale.strings` у `<Dashboard>`; туда и уходят три строки,
видимые в полосе высотой 46 пикселей: `dropPasteFiles`, `browseFiles`,
`dropHint`. `%{browseFiles}` — подстановка самого Uppy, она проходит сквозь
перевод как есть и стоит отдельной проверкой: перевод без неё — это строка, в
которой больше не на что нажать.

Четыре ключа добавлены во все шестнадцать локалей человеческим текстом каждого
языка, как в `7d34bc2a`; список `tests/locale-untranslated-allowlist.json` не
понадобился и не тронут.

# Scope / Routing

Зона записи соблюдена. `docs-resolve` по `@uppy/dashboard@4.4.3` вернул
`fallback-needed`: пакет этой версии в L1 отсутствует (404), поэтому договор
`locale.strings` прочитан в самом установленном пакете — той же версии, что
стоит в `pnpm-lock.yaml`, то есть в источнике, который и исполняется.

# Verification

Новый страж `tests/media-window.language.test.cjs` показан красным до правки
(вместе со стражем `.16` — 14 из 14 упавших), после правки зелёный. Остальные
команды — в поле `verification`.

# Delivery / Cleanup

Возвращено корню на слияние; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

Множественные строки Uppy («Uploading %{smart_count} files») остались
английскими: им нужна функция склонения локали, а не строка, и в полосе они
видны только во время загрузки. Отдельной задачей, если владелец сочтёт нужным.
