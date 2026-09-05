---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-S
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: the UNREVIEWED list of the tenant-isolation guard is pinned empty; the three suspicious queries are read and either filtered by organization or explained in ALLOWED
bounded_acceptance: tests/tenant-isolation.guard.test.cjs
non_goals:
  - живой набор на базе с двумя организациями
  - потребитель starterTemplate
  - выгрузка и удаление данных (вынесены решением владельца)
evidence:
  - unreviewed-empty-red-green
task_id: content-factory-next-saas.2
epic_id: content-factory-next-saas
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: проверка по коду каждого непрочитанного запроса, решение «дыра или нет»
repo: content-factory-next
branch: worktree-agent-ae080d20173abc0bb
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae080d20173abc0bb
write_zone:
  - tests/tenant-isolation.guard.test.cjs
success_criteria:
  - список UNREVIEWED пуст и пустота закреплена, а не наблюдается
  - три названных подозрительных запроса прочитаны по коду
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-S
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - tenancy
  - security
affected_surfaces:
  - backend
invariants:
  - tenancy
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: дверей и ролей не менялось
verification:
  - pnpm exec jest tests/tenant-isolation.guard.test.cjs: passed
changed_files:
  - tests/tenant-isolation.guard.test.cjs
explicit_defers:
  - живое доказательство изоляции на базе с двумя организациями и реальный потребитель starterTemplate остаются за пределами этой волны; bead не закрывать
---

# Summary

Список `UNREVIEWED` был уже пуст — все десять прочитаны 03.09.2026, две из них оказались дырами (`editTag`, `getMediaById`) и починены тогда же. Проверено, что починка на месте: `getMediaById(org, id)` фильтрует по `organizationId`, единственный вызывающий (`PostsService.updateMedia`) передаёт организацию.

Три названных подозрительных прочитаны по коду ещё раз:

- **`media.findUnique` из `posts.service`** — этого запроса больше нет. Он стал `findFirst` с `organizationId`, и в реестре стража его нет вовсе.
- **`autoPost.update`** — это `updateUrl`, пишет последний виденный адрес ленты из состояния рабочего процесса, с идентификатором оттуда же. Два соседа, обращённых к запросу (`deleteAutopost`, `changeActive`), фильтруют.
- **`oAuthApp.update` по идентификатору из запроса** — таких мест оказалось три (`updateApp`, `deleteApp`, `updateClientSecret`), и все три пишут строку, найденную `findFirst` с `organizationId` двумя строками выше. Идентификатор из запроса до этой строки не доходит.

**Что действительно было доделано.** Пустота списка не была закреплена: потолок стоял «не больше десяти», что верно, пока список разгребают, и неверно с того момента, как он опустел — «список, который только убывает» с десятью свободными местами может вырасти десять раз. Теперь пустота проверяется как пустота. Сам список оставлен в файле: будущей находке нужно место, где постоять, пока её читают, — и положить туда что-нибудь теперь стоит красного теста и разговора, в чём и смысл.

Отдельно: работа по `content-factory-next-5w6u` в этой же волне показала, что «прочитаны все» 03.09.2026 было правдой на уровне файла и неправдой на уровне вызова — девятнадцать мест стояли за чужим объяснением. Все девятнадцать прочитаны, подробности в артефакте `content-factory-next-5w6u.md`. Новых дыр среди них нет.

# Scope / Routing

Зона записи — только страж. В `integrations/**` и `media/**` править было нечего: дыр не нашлось.

# Verification

Красный до правки: в `UNREVIEWED` временно положена одна строка — три проверки покраснели, включая новую. Строка убрана, восемь проверок зелёные.

# Delivery / Cleanup

Возвращено корню; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

Bead закрывать нельзя: по комментарию от 03.09.2026 остаток задачи — живой набор на базе с двумя организациями и реальный потребитель `starterTemplate`. Ни то ни другое в этой волне не делалось, и статический страж их не заменяет.
