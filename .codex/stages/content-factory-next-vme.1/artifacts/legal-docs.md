---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.1/stage-manifest.json
stream_owner: legal_docs_worker
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-vme.1.legal-docs
stage_id: content-factory-next-vme.1
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 689491a3
worktree: /home/me/code/content-factory-next
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no temporary files, processes, commits, or external actions created
risk_level: medium
verification:
  - custom legal/contact/date/cloud-gate assertions passed
  - pnpm run docs:check passed (79 files)
  - TMPDIR=/tmp pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand passed (116 tests)
changed_files:
  - docs/product/cloud-saas-growth-spec.md
  - apps/frontend/src/content/legal/privacy.*.md (16 files)
  - apps/frontend/src/content/legal/subprocessors.*.md (16 files)
  - apps/frontend/src/content/legal/terms.*.md (16 files)
  - .codex/stages/content-factory-next-vme.1/artifacts/legal-docs.md
explicit_defers:
  - legal-review-deferred-to-full-launch
---

# Summary

Обновлена документационная граница cloud SaaS и контактный путь опубликованных
юридических документов.

- В строке открытых ворот cloud-spec удалены только `subprocessors`;
  юридическое лицо и договорные условия остались открытыми воротами. Две строки
  о публичном маршруте `/subprocessors` не менялись.
- Во всех 48 legal Markdown-файлах недействующий `privacy@aidevteam.ru` заменён
  на кликабельного Telegram-бота
  `[@content_factory_adtbot](https://t.me/content_factory_adtbot)`.
- В 16 privacy- и 16 terms-версиях инструкция удаления аккаунта больше не
  требует писать с адреса аккаунта: пользователь пишет боту и сообщает email
  аккаунта; сервис может запросить дополнительное подтверждение личности.
- Контакт в privacy и subprocessors прямо назван Telegram-ботом на всех 16
  языках. Поле `updated` единообразно изменено на `2026-08-20` во всех 48
  документах.

Primary failure source: старый email был механически повторён во всех трёх
типах документов и одновременно использовался как доказательство владения
аккаунтом. Прямая замена на Telegram-ссылку оставила бы неверное требование
«писать с адреса аккаунта», поэтому только эти инструкции были адаптированы под
фактический канал. Новые юридические гарантии не добавлялись.

# Verification

- Normal path: `pnpm run docs:check` — exit 0, `Documentation links OK (79 files
  checked)`; Markdown-ссылка на бота распознаётся корректно.
- Failure path: `TMPDIR=/tmp pnpm exec jest
  tests/cloud-saas-contract.test.cjs --runInBand` — 116/116 passed, включая
  отрицательные проверки пропущенного раздела, устаревшего перевода и
  выдуманного claim.
- Integration edge: shell assertions — ровно 48 legal-файлов, во всех 48
  `updated: 2026-08-20`, во всех 48 есть точная bot-link, старый email отсутствует,
  старая строка ворот отсутствует, две ссылки `/subprocessors` в cloud-spec
  сохранены; `git diff --check` чист.
- Проверки запускались с pnpm 10.6.1. Локальный Node был v24.19.0, поэтому
  `docs:check` вывел engine warning относительно требуемого Node 22.x; обе
  выбранные проверки завершились с exit 0. Root acceptance следует повторить
  на репозиторном Node 22.23.2.

# Risks / Follow-ups

- Содержательная юридическая проверка переводов и формулировок остаётся явно
  отложенной до full launch; этот поток её не закрывает.
- Root должен принять shared-worktree diff и выполнить итоговую stage acceptance
  на Node 22.23.2 после слияния остальных параллельных потоков.
- Никаких production/live вызовов, сообщений боту, коммитов или изменений вне
  назначенной write zone не выполнялось.
