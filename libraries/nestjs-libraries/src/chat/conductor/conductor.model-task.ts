import { withoutSecretShapes } from './secret-shapes';

/** Native model resolvers run before input processors; seed at the server input boundary. */
export const CONDUCTOR_MODEL_TASK_KEY = 'cf.modelTask';

export const seedConductorModelTask = (
  requestContext: { set: (key: any, value: any) => unknown },
  task: string | undefined
) => requestContext.set(
  CONDUCTOR_MODEL_TASK_KEY,
  typeof task === 'string' ? withoutSecretShapes(task).trim() : ''
);

export const readConductorModelTask = (requestContext?: object): string | undefined => {
  const task = (requestContext as { get?: (key: string) => unknown } | undefined)
    ?.get?.(CONDUCTOR_MODEL_TASK_KEY);
  return typeof task === 'string' && task.trim() ? withoutSecretShapes(task) : undefined;
};
