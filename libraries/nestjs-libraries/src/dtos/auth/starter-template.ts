// Every new workspace gets these four labels at registration; there is no
// longer a choice on the form. The list stays a separate file (rather than
// living inline in `create.org.user.dto.ts` or `organization.repository.ts`)
// because it is loaded bare, with no `@contentfactory/*` mocks, by several
// tests that only need the tag catalog and must not pull in class-validator
// or the rest of the DTO module graph.
export const CONTENT_WORKFLOW_TAGS = [
  { name: 'Plan', color: '#7FB03A' },
  { name: 'Draft', color: '#4D7CFE' },
  { name: 'Review', color: '#F59E0B' },
  { name: 'Schedule', color: '#8B5CF6' },
] as const;
