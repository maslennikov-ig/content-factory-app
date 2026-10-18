# Full-width manual workspaces — 18 October 2026

Task: `content-factory-next-tgeq`. Owner explicitly requested an audit of remaining width caps, especially manual avatars, channels and materials, fixes and production deployment.

## Plan and scope

1. Review both lenses before editing: correctness/completeness and reuse/quality. Independent read-only layout judgment and mechanical scan; root owns decisions and all changes.
2. Remove unjustified page/form/editor/text caps in existing components. Preserve normal gutters, responsive columns, numeric/compact controls, dialogs, bounded sidebars and social previews. Keep shared manual/assistant components.
3. Run one exact-source root release set and canonical source/public-image delivery. No dependency, API, schema, Temporal or provider changes intended; external/versioned product behavior is not being changed.
4. Verify actual production manual pages/edit modes on wide desktop and phone, plus affected embedded material. No paid calls, social publication or domain edits. Preserve original data and rollback.

## Baseline and findings

Fresh production baseline18Oct16:12UTC: publicda82a041c623/config4797, healthy0restarts,3roles online0,45Mastra tables/fingerprint4739,21foreign containers and21volumes. Private raw inventory and screenshots are under mode700 `/tmp/cf-tgeq-production-20261018`, excluded from Git.

Browser2221px confirms material core783px in1517px column, settings960px in1685px region (inner fields560px), help870px in1973px region. Avatar principal forms and channels already use their columns; avatar explanatory blocks remain capped. Read-only baseline blocked non-GET API requests.

Both isolated assessments are accepted: bounded Luna/max streams were read-only, no tests/live calls or repo edits. Human assessment confirmed density/width findings; detector returned0layout hits (its scope does not catch these caps), target947spacing tokens had0off-rhythm values. Root reconciled both lenses against actual browser geometry. Legacy off-grid spacing is outside this width-only task; existing20/24px gutters are preserved. Graph-reviewed: PieceScreen/CoreTextEdit incoming neighborhoods, baseline dd67538d, exact queried source hashes matched; no structural changes, no graph refresh needed.

Confirmed fixes: remove141text/reading caps in53existing product files; remove workspace caps in settings/onboarding,480px post-link fields and600px integration-plug form; shared PageHeader/Panel descriptions fill columns. Purposeful dialogs, numeric controls, preview440px, sidebars and title/action flex wrapping retained. No new primitive or duplicate manual/chat implementation.

Documentation decision: local class/layout changes only, no external API/library/version behavior or dependencies changed. Compiled layout and real browser geometry provide the relevant evidence; no external contract lookup required.

## Acceptance and delivery

Pending implementation and exact-source release acceptance.
