---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task5_terra
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: superadmin reviewing pending registrations
public_facade: confirmed reject action on /admin/users
bounded_acceptance: superadmin may delete only an inactive account and its otherwise empty organization through the repository
non_goals:
  - production data cleanup
  - rejection email
  - deleting active accounts or non-empty organizations
task_id: content-factory-next-3r4a
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: safe pending-registration rejection
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: destructive-flow judgment constrained to one registration subsystem
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 8915a65258704bc2e5052beffbdfdfd3abf5c629
worktree: /home/me/code/content-factory-next
write_zone:
  - admin users frontend action and confirmation
  - admin controller superadmin route
  - users service and repository safe rejection method
  - sixteen frontend locales if keys are added
  - focused rejection guards
  - task artifact
success_criteria:
  - inactive rows expose a confirmed Reject action
  - controller enforces the existing superadmin door
  - repository refuses active accounts and non-empty or shared organizations
  - successful rejection removes the account and its empty organization atomically
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - AGENTS.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - superpowers-test-driven-development
  - technical-premortem
  - impeccable
  - lazyweb
selected_agents:
  - worker
catalog_candidates:
  - existing-confirmation-modal
parallel_group: none
depends_on_streams:
  - content-factory-next-jdfy
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch stream; no separate worktree or runtime remained
risk_level: high
risk_tags:
  - destructive-data-change
  - authorization
  - ui-confirmation
affected_surfaces:
  - backend
  - ui
  - persistence
  - user-flow
invariants:
  - superadmin-only
  - inactive-only
  - empty-organization-only
  - atomic-delete
docs_impact: none
docs_reviewed: complete
docs_review_notes: contract, current repository relations and existing confirmation primitive were inspected
verification:
  - focused RED and GREEN rejection guards
  - frontend and backend TypeScript checks
  - locale and design guards if affected
  - git diff check
changed_files:
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/backend/src/api/routes/admin.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/dtos/auth/starter-template.ts
  - libraries/react-shared-libraries/src/translation/locales/{ar,bn,de,en,es,fr,he,it,ja,ka_ge,ko,pt,ru,tr,vi,zh}/translation.json
  - tests/pending-account-rejection.test.cjs
explicit_defers:
  - none
---

# Summary

Для строки `activated=false` добавлены «Одобрить» и «Отклонить». Отклонение
сначала показывает общий confirm-dialog, затем делает `POST /admin/users/:id/reject`.
Письмо не отправляется по принятому для задачи умолчанию.

## Technical premortem

Verdict: GO WITH CONDITIONS. Граница — необратимое удаление аккаунта и рабочей
области, HTTP-дверь супер-админа и UI-confirmation.

| Риск / симптом | Evidence | Предотвращение и сигнал |
| --- | --- | --- |
| Удалён активный или superadmin-аккаунт | confirmed: поля есть в `User`; route защищён `assertSuperAdmin` | Repository отказывает до мутаций; focused cases active/superadmin и controller non-superadmin |
| Удалена общая организация | confirmed: `UserOrganization` не имеет `onDelete: Cascade` | В транзакции требуется ровно одна связь пользователя и ровно один участник организации; case shared workspace |
| Cascade удалит контент тихо | confirmed: в schema есть cascade-backed `ProjectBrandProfile`, content-source/evidence/context и другие Organization relations | До первой мутации один `organization.findFirst` требует пустоту каждой non-seed relation; schema-driven guard упадёт, если добавленная relation не попала в gate; RED case simulates a cascade-backed content row |
| Осталась половина удаления | confirmed: связи `UserOrganization` без cascade, `UserIdentity` и `ProductEvent` с cascade | Все reads/deletes — `$transaction`; любая ошибка откатывает прежние удаления |
| Удалены незаявленные данные | confirmed: registration создаёт ровно четыре workflow Tags и `AiProviderSetting(usageMode=included)`; register event пишется best-effort | Allowlist допускает только эти seeds (и ровно register event этого user); каждый Tag сверяется по локализованному `name`, `color` и `deletedAt:null` с общими `CONTENT_WORKFLOW_TAGS/KEYS`; любой другой relation/seed shape отказывает до delete |
| Исполнитель обошёл confirm/дверь | confirmed: UI и controller отдельные поверхности | RED→GREEN tests держат shared dialog, endpoint и superadmin gate |

Recovery: до доставки откат кода убирает дверь; для уже подтверждённого удаления
автоматической компенсации нет, поэтому UI подтверждение и fail-closed проверки
являются обязательным до поставки.

## Behaviour exercised

- Normal: pending non-superadmin с единственной собственной пустой организацией
  и точным registration seed удаляет membership, account, Tags и организацию
  в одной транзакции.
- Refusal: отсутствующий account (404), active account, superadmin и shared
  organization (400), без mutation calls.
- Boundaries: POST доступен только superadmin; отказ в confirm не отправляет POST;
  email отсутствует намеренно.
- Assumption проверено по `OrganizationRepository.createOrgAndUser`: baseline
  состоит из четырёх локализованных `CONTENT_WORKFLOW_TAGS/KEYS` с
  `deletedAt:null`, `AiProviderSetting(included)` и необязательного register
  event. Все прочие прямые Organization relations, включая cascade-backed,
  должны быть пустыми до delete.

# Verification

- RED 1: `pnpm exec jest tests/pending-account-rejection.test.cjs --runInBand`
  failed because `repository.rejectPendingAccount` was absent.
- GREEN 1: same command passed repository normal/refusal cases.
- RED 2: same focused command failed because service method and controller door
  were absent.
- GREEN 2: same command passed service no-email and superadmin-door cases.
- RED 3: same focused command failed because the admin component had no shared
  confirmation or reject action.
- RED 4: schema-driven guard failed first for singular `subscription`, потому
  что он требует `is: null`, а не list-filter `none`; после явного special
  case guard стал green.
- RED 5: renamed и soft-deleted seed Tags проходили первоначальную сверку
  цветов; точная проверка `{name,color,deletedAt:null}` теперь отказывает до
  mutation, и cases стали green.
- GREEN/final focused command:
  `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/pending-account-rejection.test.cjs tests/locale-key-set.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs --runInBand`
  — 5 suites, 65 tests passed.
- Type checks:
  `pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit` and
  `pnpm exec tsc -p apps/backend/tsconfig.json --noEmit` — passed.
- `git diff --check` — passed.

# Risks / Follow-ups

No production cleanup was performed. No schema change, raw SQL, email queue,
Beads mutation, commit, push, merge, deploy, host, or production database was
touched.

## Independent security correction

Sol-review нашёл CSRF и гонку approve/reject. Дверь теперь до сервиса требует JSON,
точный `Origin` и совпадение с JWT-сесией. Repository выполняет read/check/delete в `Serializable`,
повторяет `P2034` не более трёх раз и удаляет user только условным `activated:false,
isSuperAdmin:false` с `count === 1`. RED покрыл отказы и retry exhaustion; GREEN вошёл в Sol-набор 79/79.
Независимый review подтвердил исправление.
