# Аудит донора: контентный интеллект

**Дата:** 2026-08-20  
**Статус:** исследование, не разрешает перенос кода  
**Донор:** `/home/me/code/content-factory`, только чтение, HEAD `20c8689726297de234b0a9fb2c812e76ffae7e52`  
**Целевой baseline:** `1534b132`

## Решение

Ни один исполняемый кандидат из донора сейчас нельзя переносить. В корне донора
и в его отслеживаемом дереве нет `LICENSE`, `NOTICE` или `COPYING`; история
релевантных файлов указывает на `Antigravity AI <bot@aidevteam.ru>`, а private
`origin` не доказывает право организации на распространение или совместимость с
AGPL. По правилу fail closed итог для кода, миграций, промптов, fixtures и UI —
**reject**. Идеи ниже допустимо использовать только как список вопросов для
независимой разработки, не как право копировать текст, структуру или алгоритм.

## Матрица keep / adapt / reject

| Область и кандидат | Исходные пути / символы | Назначение и защиты | Решение; совместимость | Provenance / public-safety | Порядок |
| --- | --- | --- | --- | --- | --- |
| Паспорт проекта и voice | `packages/core/projectProfilePersistence.mjs`: `createPostgresProjectProfilePersistenceStore`, `saveConfirmedProjectProfileRevision`; `projectVoiceInterviewContract.mjs`: `createProjectVoiceInterviewRuntime`; `apps/console/app/project-profile/actions.mjs`: `confirmProjectVoiceProfileAction` | Версии, active base, archive/delete/restore; интервью и summary. | **Reject code.** Концептуально `adapt` только после самостоятельного product decision. Донор: Next server actions + own Postgres; цель: Nest DTO → controller → service/repository → Prisma. | Нет license/ownership proof; account/project не доказывает нужную target organization ownership. Raw examples/model gateway повышают риск приватных данных и платных вызовов. | Сначала target schema/tenant/version/delete semantics; затем API; UI только по `cf` design rules. |
| URL/RSS-источники | `websiteRssSourceContract.mjs`: `createWebsiteRssSourceRuntime`, `validateExplicitSourceInput`, `reserveWebsiteRssServerGateState`; `sourceWizardManualIntake.mjs`: `createSourceWizardManualIntakeRuntime`; `apps/console/app/source-wizard/actions.mjs`: `submitSourceWizardManualIntakeAction` | HTTPS-only, explicit URL, rights/robots/operator gates, dedupe/freshness, 5s/128KB sandbox, private-host block, manual redirect re-check. | **Reject code; adapt requirements only.** Payload private storage and bespoke store do not match Prisma/Nest. | License absent. Contract is not proof of a shared production SSRF resolver with DNS/IP checks at every redirect hop. Stage permits implementing an explicit allowed URL/RSS runtime; this research/acceptance run must use local deterministic fixtures and make no live request. | Define target shared SSRF boundary before persistence; then source-registry schema, deterministic fixtures and traceable-draft integration. |
| Telegram | `telegramSourceMvpContract.mjs`: `createTelegramSourceMvpRuntime`; `sourceWizardManualIntake.mjs`; `docs/research/channel-playbooks/telegram/` | Manual/private intake; role `private-source-operator`; blocks bot token, webhook, `getUpdates`, channel/chat ID and public scraping terms. | **Reject code and playbook text.** `Keep`: only target question that collection is disabled now. | License/author ownership unproven; Telegram terms, consent and personal-data conditions not established. | Keep outside first vertical; require separate legal/product authority and provider adapter. |
| Память фактов и evidence | `entityMemoryContract.mjs`: `buildEntityMemoryLanguageNeutralFactRecord`; `entityMemoryRuntimeStore.mjs`: `atomicPersistEntityMemoryLanguageNeutralFact`, `redactEntityMemorySourceRef`; `sourceMemoryControlContract.mjs` | Metadata-only fact records, separate raw archive, conflict proposals, source-ref deletion workflow. | **Reject code; adapt invariants only.** Donor SQL mirror tables/migration and `accountAlias/projectId` differ from Prisma organization boundary. | License absent. Donor says `deletePropagatesToEntitySourceRefs: false`, contrary to stage invariant that deleted evidence cannot remain confirmed context. | Define fact/evidence freshness/conflict/deletion first, then Prisma model + transactional repository. |
| Генератор и редактор | `localDraftGenerationContract.mjs`: `createLocalDraftGenerationRuntime`, `bindDraftGenerationVoiceContext`; `contentJobDraftPackageContract.mjs`: `createContentJobDraftPackageRuntime`; `draftVoiceAuditWorkflow.mjs`: `createDraftVoiceAuditRuntime`; `apps/console/app/drafts/actions.mjs`: `createContentJobDraftPackageAction` | Synthetic draft package binds voice/evidence; audit read model. | **Reject code.** Target requirement to adapt: one versioned context reference per output. Existing target entry: `PostsController.generatePostsDraft` / `AgentGraphService.start`; editor is `apps/frontend/src/components/new-launch/editor.tsx`. | License absent. AI gateway/prompt/output provenance unknown; fixture contracts must not imply provider availability. | After accepted profile/source/fact contracts, design draft-only context assembler; no AI call now. |
| Chat-agent integration | `agentExecutorContract.mjs`: `createAiSdkAgentExecutor`, `validateAgentExecutorRun`; target `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`: `AgentGraphService.start` | Donor compares executors, not a target-compatible tool contract. | **Reject donor code.** Target reuse point is existing agent service, via an explicit context contract and AI policy only. | License absent; tool execution can expose evidence or spend credits. `included/workspace_key` cannot fallback. | Add no integration before read-only scoped-context API and access tests. |
| AutoPost / публикация | Donor `contentPipeline*` contracts; target `autopost.controller.ts`, `autopost.service.ts`: `startAutopost`, `apps/orchestrator/src/activities/autopost.activity.ts` | Donor release/package gates. Target can start `autoPostWorkflow`; service can research/generate/schedule. | **Reject donor code.** URL/RSS first vertical ends at a traceable draft; nevertheless AC .7 requires AutoPost to consume the same profile/context/metadata through a non-publishing path. | License absent; direct live-publication/async boundary. ADR-0003 prohibits mutation of upstream Temporal contracts. | Add a new versioned non-publishing workflow/activity or adapter for the context consumer; do not change `autoPostWorkflow`, schedule or publish. |

## Целевой путь и границы

### Definitive: существующие точки входа

1. **Генератор:** `apps/frontend/src/components/launches/generator/generator.tsx` →
   `POST /posts/generator/draft` либо `/posts/generator` →
   `apps/backend/src/api/routes/posts.controller.ts:226` (`generatePostsDraft`) /
   `:235` (`generatePosts`) → `PostsService` либо `AgentGraphService.start`.
2. **Agent:** `AgentGraphService.start` создаёт генераторный поток и использует
   `AiUsageService`; это policy/paid-call boundary.
3. **AutoPost:** `AutopostController` → `AutopostService.createAutopost` /
   `changeActive` → existing `autoPostWorkflow` →
   `apps/orchestrator/src/activities/autopost.activity.ts`. Это persistence,
   Temporal и потенциальная публикация.
4. **Editor:** `apps/frontend/src/components/new-launch/editor.tsx` — UI adapter
   posts. Точная server mutation path не definitive: target graph stale.

### Policy checkpoints и material branches

- Controller получает организацию через `GetOrgFromRequest`; новый контекст
  нельзя доверять из client payload.
- `AgentGraphService` и `AutopostService` могут вызвать AI/research; URL/RSS
  acceptance использует injected deterministic fixture, а не live side effect.
- `AutopostService.startAutopost` запускает upstream Temporal workflow; его
  contract нельзя менять.
- URL/RSS: duplicate, stale/expired, unsafe redirect/DNS, robots/terms и denied
  membership блокируются до network/persistence.
- Fact: deleted, stale или conflicted evidence исключается из context, а не
  выдаётся как подтверждённое.

## Критические несовместимости

| Слой | Донор | Target | Риск / классификация |
| --- | --- | --- | --- |
| HTTP/UI | Next 16 server actions, React 19 console | frontend SWR/useFetch and design system | UI copy/structure cannot be ported; **must-fix**, high confidence. |
| Data | custom Postgres/Drizzle/Payload tables/stores | Prisma; DTO → controller → service/manager → repository | tenant/deletion semantics would be bypassed; **must-fix**, high confidence. |
| Async | pg-boss/runtime contracts | upstream Temporal + versioned workflow rule | copying could mutate/amplify a live workflow; **must-fix**, high confidence. |
| AI | OpenRouter/AI SDK contracts | `included/workspace_key` policy | hidden credentials fallback or paid call; **must-fix**, high confidence. |

## Неопределённости и быстрые проверки

| Неизвестное | Почему confidence ограничен | Самая быстрая следующая проверка |
| --- | --- | --- |
| Донорское право на код/документы | Нет license/NOTICE и полномочия автора-бота. | Организация предоставляет signed provenance manifest: owner, file digest, contributor agreements, dependency/license inventory, AGPL decision. До этого reject. |
| Exact editor save chain | Graph stale: built `41baba7b`, worktree `1534b132`; audit не делал broad traversal. | После accepted integration refresh graph; `graphify path` from Editor to PostsService, then targeted source read. |
| Source SSRF implementation | Donor contract не является target implementation и не доказывает per-hop resolver. | Target threat model/tests: DNS rebinding, redirect chain, IPv4/IPv6/private ranges before code. |
| Authorization for new models | Моделей пока нет; permission abstraction shared/high-impact. | Root maps `Organization`/ability ownership with focused Graphify paths before schema design. |
| All four consumer paths | Generator/editor/agent/AutoPost differ; stale graph prevents full definitive UI chain. | Accepted target context DTO/version + consumer matrix before RED→GREEN. |

## Рекомендуемый порядок

1. Принять независимые contracts profile/voice, source registry, fact/evidence с
   ownership, freshness, deletion и explicit-runtime/no-live-acceptance invariants.
2. Refresh target graph; map organization/permission and generator/editor; define
   read-only versioned context DTO.
3. Реализовать explicit allowed URL/RSS → traceable draft vertical через target
   backend; acceptance проходит только local deterministic fixtures, без наших
   live network calls.
4. Add generator, editor, agent and AutoPost consumers under one context version.
   Для AutoPost добавить versioned non-publishing activity/workflow or adapter;
   не менять upstream `autoPostWorkflow` и не вызывать schedule/publish.
5. Рассматривать фактическую live collection или publishing лишь после отдельных
   security, legal и product authority.

## Evidence

- Target: `AGENTS.md`, `PRODUCT.md`, `docs/product/product-scope.md`, ADR-0001,
  ADR-0003, ADR-0005, ADR-0006, ADR-0008, stage `spec.md`.
- Donor: matrix paths, `package.json` (Next/Payload/Drizzle/pg-boss), git history
  and tracked-tree license inspection.
- Graph: focused `AutopostService` / `AgentGraphService` queries. Freshness
  mismatch is recorded, therefore graph evidence is orientation rather than
  proof for any uninspected path.
