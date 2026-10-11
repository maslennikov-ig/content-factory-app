// Exact recorded names; also safe to import in the workflow sandbox.
export const MAIL_WORKFLOW_TYPES = new Set([
  'sendEmailWorkflow',
  'sendEmailWorkflowV2',
  'sendEmailWorkflowV3',
]);

export const MAIL_ACTIVITY_TYPES = new Set([
  'sendEmail',
  'sendEmailV2',
  'sendEmailAsync',
]);
