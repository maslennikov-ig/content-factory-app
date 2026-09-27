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
    // Unconditional, including under NOT_SECURED. The CopilotKit provider sets
    // `credentials="include"` in the markup and never asks whether the
    // deployment is secured (agent.chat.tsx, layout.component.tsx,
    // preview.wrapper.tsx), and a browser drops a credentialed response whole
    // unless it sees `Access-Control-Allow-Credentials`. Making this
    // conditional silently kills the AI chat and the agents on every
    // NOT_SECURED stack. It stays safe because `origin` below is an explicit
    // allowlist rather than a wildcard.
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'auth',
      'showorg',
      'impersonate',
      'x-copilotkit-runtime-client-gql-version',
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
      'x-copilotkit-runtime-client-gql-version',
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
