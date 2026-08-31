export const STARTER_TEMPLATES = ['blank', 'content-workflow'] as const;
export type StarterTemplate = (typeof STARTER_TEMPLATES)[number];

export const CONTENT_WORKFLOW_TAGS = [
  { name: 'Plan', color: '#7FB03A' },
  { name: 'Draft', color: '#4D7CFE' },
  { name: 'Review', color: '#F59E0B' },
  { name: 'Schedule', color: '#8B5CF6' },
] as const;

export function isStarterTemplate(value: unknown): value is StarterTemplate {
  return (
    typeof value === 'string' &&
    (STARTER_TEMPLATES as readonly string[]).includes(value)
  );
}
