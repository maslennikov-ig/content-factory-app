# Global runtime tools — stage in progress

Task: content-factory-next-dbxe.34; source branch codex/dbxe-global-runtime-20261011.
Scope: exact final-image globals and compatible native CLI/supervisor behavior.

Implementation: remove unused runtime package managers, keep PM2 7.0.3 and pin its
direct js-yaml4.3.2, preserve guarded Prisma CLI with its verified6.5 engine.
Original task/epic criteria, product lock, workflow contracts and data are kept.

Evidence so far: all51 baseline records map to installed global paths;137 focused
tests PASS; native controlled PM2 startup/restart/CLI/shutdown and real offline
Prisma bootstrap/equal-schema/SQL-guard checks PASS. The initial missing-engine
fixture failure is retained. Full changed-release and deployment are pending.

docs-reviewed: production bootstrap command and global-tool runbook match actual consumers.
graph-reviewed: existing d724 graph used for focused pnpm/PM2 orientation; exact current files confirmed. No application architecture or graph extraction changed.

One bounded advisory specialist writes research only. Root owns implementation,
acceptance and delivery. Task34/8 remain IN_PROGRESS until exact release proof;
epic stays OPEN. No provider/model call, real publication or backup restoration.
