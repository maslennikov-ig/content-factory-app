import { log, workflowInfo, WorkflowInterceptors } from '@temporalio/workflow';
import { MAIL_WORKFLOW_TYPES } from './mail-log-scope';

// The SDK's legacy sandbox console bypasses Runtime.logger. Keep its original
// behavior outside mail, including when multiple workflows share a V8 context.
const originalConsole = { ...console };

export function interceptors(): WorkflowInterceptors {
  // reuseV8Context freezes the shared console object's methods, while global
  // bindings are virtualized per workflow. Replace the binding, not its methods.
  const scopedConsole = { ...originalConsole };
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    scopedConsole[method] = (...args: unknown[]) => {
      if (MAIL_WORKFLOW_TYPES.has(workflowInfo().workflowType)) {
        const level = method === 'log' ? 'info' : method;
        log[level]('mail.workflow_console');
      } else {
        originalConsole[method](...args);
      }
    };
  }
  globalThis.console = scopedConsole as Console;
  // Logging has no workflow commands and changes no recorded history contract.
  return {};
}
