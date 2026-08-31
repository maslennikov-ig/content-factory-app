---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:public-funnel-browser-evidence
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: content-factory-next-or3 root acceptance
public_facade: anonymous public funnel and synthetic demo
bounded_acceptance: reproducible Chrome matrix, complete local demo walkthrough, accessibility checks and sanitized request proof
non_goals:
  - product UI changes
  - backend or database proof
  - live publishing, account creation, OAuth, provider or paid calls
evidence:
  - focused-red-green
  - chrome-browser-matrix
  - synthetic-demo-walkthrough
  - sanitized-request-ledger
  - sanitized-har
  - visual-review
task_id: content-factory-next-or3.public-funnel-browser-evidence
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: reproducible public funnel browser evidence
milestone_status: accepted
agent_type: frontend_specialist
subagent_model: gpt-5.6-sol
reasoning_effort: medium
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - scripts/evidence/capture-public-funnel.cjs
  - tests/interface-review-public-funnel.test.cjs
  - .codex/stages/content-factory-next-or3/evidence/public-funnel
  - .codex/stages/content-factory-next-or3/artifacts/public-funnel-browser-evidence.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: local Chrome contexts closed and the temporary frontend dev server was stopped; no browser download, external session, account, credential or live resource was created
risk_level: medium
risk_tags:
  - ui
  - privacy
  - localization
affected_surfaces:
  - ui
  - user-flow
invariants:
  - privacy
  - state-transition
  - test-matrix
verification:
  - focused RED observed the missing capture module before implementation
  - focused GREEN passed 1 suite and 10 request and matrix contract tests
  - Chrome 149.0.7827.53 captured all 40 route-width-theme-locale combinations and five complete demo-flow stages
  - manifest inspection confirmed 45 non-empty PNG files, exact 390 and 1440 widths, RU and EN, light and dark, zero horizontal overflow, reduced-motion enabled and visible keyboard focus in every matrix scene
  - sanitized HAR and request ledger contain 2053 browser requests, 10 allowed same-origin public-growth POSTs, zero external requests, zero other mutations and zero tenant, AI, Temporal, OAuth, publish, account or paid-provider paths
  - visual inspection covered mobile and desktop, both themes, RU and EN, and the final demo result
  - final candidate refresh after shared RadioGroup adoption and its 4 px rhythm correction reproduced the same 40 matrix scenes, 5 demo stages, 45 PNG files, 2053 requests, 10 allowed growth POSTs and zero forbidden traffic
  - scoped git diff check and orchestration artifact v3 validation passed
changed_files:
  - scripts/evidence/capture-public-funnel.cjs
  - tests/interface-review-public-funnel.test.cjs
  - .codex/stages/content-factory-next-or3/evidence/public-funnel/manifest.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel/request-ledger.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel/network.har
  - .codex/stages/content-factory-next-or3/evidence/public-funnel/screenshots
  - .codex/stages/content-factory-next-or3/artifacts/public-funnel-browser-evidence.md
explicit_defers:
  - root acceptance owns the wider stage suite, backend receipt persistence and release checks
---

# Summary

Создан воспроизводимый browser-capture для реальных публичных маршрутов `/`,
`/product`, `/security`, `/docs` и `/demo`. Он запускает установленный
`/usr/bin/google-chrome`, не скачивает браузер и принимает только локальный
`http://localhost:4200`. Полная матрица включает 40 сочетаний: 5 маршрутов ×
390/1440 × light/dark × RU/EN. Для каждого сочетания сохранён полноразмерный
PNG и машинный результат по языку, теме, горизонтальному переполнению,
`prefers-reduced-motion`, активным анимациям и видимому клавиатурному фокусу.

Отдельный браузерный проход провёл собственный синтетический текст через
Material → Adaptation → Review → Schedule → Result. Он действительно передал
материал на review, одобрил его, выбрал 19 мая и 09:00 и дошёл до панели с
пометкой `Demo data`. Все пять состояний сохранены отдельными снимками.

# Verification

Для запуска нужен frontend dev server с тем же origin:

```text
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH NEXT_PUBLIC_BACKEND_URL=http://localhost:4200 FRONTEND_URL=http://localhost:4200 MAIN_URL=http://localhost:4200 STORAGE_PROVIDER=local NOT_SECURED=true pnpm --filter ./apps/frontend run dev
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH PUBLIC_FUNNEL_BASE_URL=http://localhost:4200 CHROME_PATH=/usr/bin/google-chrome node scripts/evidence/capture-public-funnel.cjs
```

`localhost` существенен для dev-режима Next: обращение через `127.0.0.1`
считалось другим dev origin, HMR был заблокирован и React-интеракции не
гидратировались. Это ограничение среды захвата, а не правка продукта.

Focused contract:

```text
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/interface-review-public-funnel.test.cjs --runInBand --coverage=false
```

RED завершился ожидаемым `Cannot find module ...capture-public-funnel.cjs`.
GREEN: 1 suite, 10 tests passed. Контракт независимо проверяет полный размер
матрицы, единственный допустимый mutation path и отказ для tenant, AI,
Temporal, OAuth, publish, account, paid-provider и любого external URL.

`manifest.json` фиксирует 40 matrix scenes, 5 demo stages и 45 PNG. Максимум
page-level overflow равен 0 px; все 40 сцен имеют `lang` RU/EN, правильный класс
light/dark, включённый reduced-motion и ненулевую видимую outline у элемента,
получившего фокус через Tab. Сырых `public_saas_*` ключей в UI нет.

`request-ledger.json` и `network.har` не содержат headers, cookies, request
bodies или текста посетителя. Сохраняются method, URL, resource type, status
когда он доступен и только allowlisted coarse growth payload. В 2053 запросах
dev-сервера есть ровно 10 разрешённых `POST /public-growth-events`: восемь
`landing_view` из полной матрицы главной страницы и по одному `demo_started`
(`plan`) и `demo_completed` (`schedule`) из сквозного demo. External, прочих
mutation и чувствительных путей — 0.

Финальный refresh выполнен после перехода chooser на общий `RadioGroup`.
Demo lane теперь, как и matrix lane, даёт клиентской гидратации 250 ms до
первого screenshot; это устраняет ложный Next dev stack-frame POST от
временного скрытия caret в Playwright и не ослабляет request allowlist.

# Risks / Follow-ups

HAR отражает Next dev runtime, поэтому большую часть 2053 записей составляют
same-origin chunks и dev assets. Он доказывает browser-visible request boundary,
но не заменяет отдельное backend/database доказательство приёма growth events;
оно принадлежит соседнему runtime stream и корневой приёмке.

Снимки проверены выборочно для mobile/desktop, light/dark, RU/EN и результата
demo. Автоматика проверяет геометрию, overflow, focus и отсутствие сырых ключей,
но не заявляет ручной лингвистический перевод всех строк. Исходный capture
stream не менял продуктовый UI; после корневой release-коррекции chooser на
общий choice primitive доказательства были полностью пересняты.
