import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Build the backend CORS contract from the deployment environment.
 *
 * Keeping this as data makes the browser-facing preflight behavior testable
 * without booting Redis, Temporal or the rest of the Nest application.
 */
export function buildBackendCorsOptions(
  env: NodeJS.ProcessEnv
): CorsOptions {
  return {
    // Unconditional, including under NOT_SECURED. A credentialed request from
    // a frontend of another origin (the stand, a split self-host) is dropped
    // whole by the browser unless it sees `Access-Control-Allow-Credentials`,
    // and making this conditional once silently killed the AI chat on every
    // NOT_SECURED stack (the CopilotKit provider, gone with `kcxz.28`, sent
    // `credentials="include"` regardless). It stays safe because `origin` below is an explicit
    // allowlist rather than a wildcard.
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'auth',
      'showorg',
      'impersonate',
      // Every agent chat request and the thread history name the zone the
      // screens use (`AGENT_TIMEZONE_HEADER`). A custom request header makes
      // the browser ask first; unlisted, it blocks the whole chat on a
      // frontend of another origin (the stand, a split self-host; review W2 F1).
      'x-agent-timezone',
    ],
    exposedHeaders: [
      'reload',
      'onboarding',
      'activate',
      'approval',
      // `POST /agent/chat` names the thread a first message opened; a
      // frontend on another origin (the stand, a split self-host) must read it
      // or every message would open a new thread. `AGENT_THREAD_HEADER`.
      'x-agent-thread-id',
      ...(env.NOT_SECURED ? ['auth', 'showorg', 'impersonate'] : []),
    ],
    origin: [
      env.FRONTEND_URL,
      // The MCP Inspector is a local development tool; a deployed instance has
      // no reason to answer a browser on the operator's own machine.
      ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:6274']),
      ...(env.MAIN_URL ? [env.MAIN_URL] : []),
    ].filter((origin): origin is string => Boolean(origin)),
  };
}
