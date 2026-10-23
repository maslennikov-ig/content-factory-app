/** No service import: the domain and the starter share this acyclic port. */
export const VIDEO_EXECUTION_V1 = Symbol('VIDEO_EXECUTION_V1');
export interface VideoExecutionPortV1 {
  /** A nonzero cycle resumes only explicit result saving, never another generation. */
  start(organizationId: string, jobId: string, cycle?: number): Promise<void>;
}
