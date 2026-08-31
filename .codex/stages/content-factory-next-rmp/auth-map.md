---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-rmp/stage-manifest.json
stream_owner: rmp_auth_map
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-rmp
epic_id: content-factory-next-aay
stage_id: content-factory-next-rmp
agent_type: code_mapper
subagent_model: gpt-5.6-sol
reasoning_effort: high
branch: work/user-identity
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-user-identity
write_zone:
  - read-only repository map
status: accepted
delivery_method: read-only findings
accepted_by_orchestrator: yes
cleanup_status: not_applicable
risk_level: high
risk_tags:
  - migration
  - security
  - authorization
  - atomicity
  - data
affected_surfaces:
  - database
  - backend
  - api
  - ui
docs_impact: structural
docs_reviewed: no-change-needed
docs_review_notes: implementation stream owns the operator-facing backfill note
verification:
  - repository and Graphify inspection: passed
changed_files:
  - .codex/stages/content-factory-next-rmp/auth-map.md
explicit_defers:
  - none
---

# Карта auth-потока

- `AuthService.routeAuth` и `checkExists` сходятся в `UsersService.getUserByProvider`; это центральная точка перевода входа на `UserIdentity` с временным fallback к legacy-полям.
- `OrganizationRepository.createOrgAndUser` создаёт и LOCAL, и внешних пользователей. Новая запись должна сразу получить первую identity; `createMaxUser` остаётся отдельным LOCAL consumer.
- `UsersController` уже находится за `AuthMiddleware`, поэтому list/link/unlink принадлежат этому контроллеру и получают user id только из `GetUserFromRequest`.
- `SettingsPopup`/`GlobalSettings` — текущая профильная поверхность. Новый компонент должен использовать `useFetch`, shared controls, `cf`-токены, translation helper и явные loading/empty/error/disabled состояния.
- `AuthController.oauth/:provider/exists` — публичный login callback. Link completion нельзя подмешивать в него по email: отдельный аутентифицированный endpoint должен верифицировать provider token/code и привязать identity к текущей сессии.
- `UsersRepository.switchUserCredentials` — скрытый consumer login identity. Операция меняет логины двух аккаунтов и обязана атомарно обменивать связанные identity-наборы вместе с primary-полями, иначе административный switch перестанет менять реальный вход.
- `forgot`/`updatePassword` сегодня считают пароль доступным только при primary `Provider.LOCAL`; после linking они должны опираться на LOCAL identity, не на primary provider.

## Обязательное решение

`LOCAL` использует normalized email как `providerIdentifier`. Обычная регистрация хранит legacy `providerId=''`, а enterprise LOCAL — `null`; буквальный backfill этих значений несовместим с глобальной уникальностью. Legacy-поля не переписываются.

## Минимальная test matrix

1. External login resolves through identity and preserves legacy fallback before backfill.
2. Linking requires current authenticated user; provider email never chooses the target account.
3. Identity owned by another user is refused and never moved.
4. Unlink of the last identity is refused; unlink LOCAL with another method clears the password.
5. Telegram-origin account can add normalized email/password and then use LOCAL login/reset.
6. New users receive an initial identity; LOCAL uses normalized email.
7. Admin credential switch exchanges identity ownership atomically.
8. Backfill defaults to report-only, maps LOCAL to normalized email, reports conflicts, and writes only after explicit `--apply`.
9. Settings renders connected/missing/error/loading/protected-removal states with direct actions.

Graphify: used the report built from `cda692c6` plus a focused Auth/Users/Settings query; exact consumers were confirmed against current `main` code because the graph is stale.
