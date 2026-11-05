import { z } from 'zod';
const operation = z.enum(['knowledge.read','crm.outcomes.read','knowledge.propose','knowledge.invalidate']);
const fieldRef = z.string().min(1).max(256);
export const helixaTrackingBindingSchema = z.object({ sourceId: z.string().min(1).max(240), fields: z.object({
  link: fieldRef, campaign: fieldRef, source: fieldRef, medium: fieldRef, content: fieldRef.optional(),
}).strict() }).strict().superRefine((value, context) => {
  const refs = Object.values(value.fields);
  if (new Set(refs).size !== refs.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Tracking fields must be distinct.' });
});
const bindingSchema = z.object({
  contentFactoryOrganizationId: z.string().min(1), helixaOrganizationId: z.string().min(1), projectId: z.string().min(1).optional(),
  origin: z.string().url(), sessionCookieVariable: z.string().regex(/^CF_HELIXA_SESSION_COOKIE_[A-Z0-9_]+$/),
  approvedOperations: z.array(operation).min(1), approvedBy: z.string().min(1), expiresAt: z.string().datetime(),
  crmTracking: helixaTrackingBindingSchema.optional(),
}).strict();
export type HelixaSessionBinding = z.infer<typeof bindingSchema> & { sessionCookie: string };
export type HelixaBindingResolver = (organizationId: string) => Promise<HelixaSessionBinding | null>;
export const SOCIAL_FACTORY_HELIXA_BINDING = Symbol('SOCIAL_FACTORY_HELIXA_BINDING');
export const SOCIAL_FACTORY_HELIXA_CLOCK = Symbol('SOCIAL_FACTORY_HELIXA_CLOCK');
export const SOCIAL_FACTORY_HELIXA_FETCH = Symbol('SOCIAL_FACTORY_HELIXA_FETCH');

/** Opt-in configuration only. This code neither creates nor renews a session/delegation. */
export const environmentHelixaBinding: HelixaBindingResolver = async (organizationId) => {
  if (!process.env.CF_HELIXA_BINDINGS_JSON) return null;
  try {
    const values = z.array(bindingSchema).max(100).parse(JSON.parse(process.env.CF_HELIXA_BINDINGS_JSON));
    const matches = values.filter((v) => v.contentFactoryOrganizationId === organizationId);
    if (matches.length !== 1) return null;
    const configured = matches[0], origin = new URL(configured.origin);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || Date.parse(configured.expiresAt) <= Date.now()) return null;
    const cookie = process.env[configured.sessionCookieVariable];
    if (!cookie || cookie.length > 8192 || /[\r\n]/.test(cookie)) return null;
    return { ...configured, origin: origin.origin, sessionCookie: cookie };
  } catch { return null; }
};
