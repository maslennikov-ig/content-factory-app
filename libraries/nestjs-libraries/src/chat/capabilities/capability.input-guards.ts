import type { z } from 'zod';
import type { CapabilityDeclaration, RiskClass } from './capability.types';

/**
 * Two rules about what the model may pass, checked on the schema itself when
 * the registry is built (`content-factory-next-kcxz.6`) and again by the guard
 * in `tests/`.
 *
 * 1. No identity. The organization and the person come from the server-built
 *    context (spec §4.3); an input that named them would let a model — or a
 *    text it read — choose whose workspace to act in.
 * 2. Reserve only (premortem A1). Nothing a capability does without a card may
 *    reach the outside world by itself. A schema of any class but `confirm`
 *    that accepts «autopilot», «queue», «publish» or «schedule» as a value, or
 *    carries a free-text mode or status the model could fill with them, is
 *    refused. Placement into the plan writes an explicit reserve; switching a
 *    channel to autopilot and publishing are `confirm`.
 */

const IDENTITY_KEY =
  /^(organization|organizationid|orgid|org|workspaceid|user|userid|actoruserid|ownerid|authorid|tenantid)$/i;

/** Values that make a post leave without a further human act. */
const OUTBOUND_VALUE =
  /^(autopilot|queue|queued|publish|published|publish_now|publishnow|now|schedule|scheduled)$/i;

/** Keys that are themselves a request to send something out. */
const OUTBOUND_KEY = /(autopilot|publish|queue)/i;

/** Keys whose free-text value the model could fill with an outbound value. */
const MODE_KEY = /^(status|state|mode|planmode|placement|type)$/i;

/** Classes allowed to carry an outbound value: the person approves them. */
const OUTBOUND_ALLOWED: readonly RiskClass[] = ['confirm'];

type Finding = { path: string; problem: string };

const typeName = (schema: z.ZodTypeAny): string =>
  (schema?._def as { typeName?: string })?.typeName ?? '';

/** Walks a zod (v3) schema; `visit` sees every node with its key path. */
const walk = (
  schema: z.ZodTypeAny,
  visit: (node: z.ZodTypeAny, path: string[]) => void,
  path: string[] = []
) => {
  if (!schema) return;
  visit(schema, path);
  const def = schema._def as Record<string, any>;
  switch (typeName(schema)) {
    case 'ZodObject': {
      const shape =
        typeof def.shape === 'function' ? def.shape() : (def.shape ?? {});
      for (const [key, child] of Object.entries(shape)) {
        walk(child as z.ZodTypeAny, visit, [...path, key]);
      }
      if (def.catchall && typeName(def.catchall) !== 'ZodNever') {
        walk(def.catchall, visit, [...path, '*']);
      }
      return;
    }
    case 'ZodArray':
      return walk(def.type, visit, [...path, '[]']);
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodReadonly':
    case 'ZodCatch':
    case 'ZodBranded':
      return walk(def.innerType ?? def.type, visit, path);
    case 'ZodEffects':
      return walk(def.schema, visit, path);
    case 'ZodPipeline':
      walk(def.in, visit, path);
      return walk(def.out, visit, path);
    case 'ZodLazy':
      return walk(def.getter(), visit, path);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      for (const option of def.options instanceof Map
        ? [...def.options.values()]
        : def.options) {
        walk(option, visit, path);
      }
      return;
    case 'ZodIntersection':
      walk(def.left, visit, path);
      return walk(def.right, visit, path);
    case 'ZodRecord':
    case 'ZodMap':
      walk(def.valueType, visit, [...path, '*']);
      return;
    case 'ZodTuple':
      (def.items ?? []).forEach((item: z.ZodTypeAny, index: number) =>
        walk(item, visit, [...path, String(index)])
      );
      return;
    default:
      return;
  }
};

/** Literal values a node accepts, when it names them. */
const acceptedValues = (node: z.ZodTypeAny): unknown[] => {
  const def = node._def as Record<string, any>;
  switch (typeName(node)) {
    case 'ZodEnum':
      return def.values ?? [];
    case 'ZodNativeEnum':
      return Object.values(def.values ?? {});
    case 'ZodLiteral':
      return [def.value];
    case 'ZodDefault':
      return [def.defaultValue?.()];
    default:
      return [];
  }
};

const isFreeText = (node: z.ZodTypeAny) =>
  ['ZodString', 'ZodAny', 'ZodUnknown'].includes(typeName(node));

/** Every place a schema takes free text. */
export const freeTextPaths = (schema: z.ZodTypeAny): string[] => {
  const paths: string[] = [];
  walk(schema, (node, path) => {
    if (isFreeText(node)) paths.push(path.join('.') || '(root)');
  });
  return paths;
};

export const identityFindings = (schema: z.ZodTypeAny): Finding[] => {
  const findings: Finding[] = [];
  walk(schema, (_node, path) => {
    const key = path[path.length - 1];
    if (key && IDENTITY_KEY.test(key)) {
      findings.push({
        path: path.join('.'),
        problem: 'names an organization or a user',
      });
    }
  });
  return findings;
};

export const outboundFindings = (schema: z.ZodTypeAny): Finding[] => {
  const findings: Finding[] = [];
  walk(schema, (node, path) => {
    const key = path[path.length - 1] ?? '';
    if (key && OUTBOUND_KEY.test(key)) {
      findings.push({
        path: path.join('.'),
        problem: 'is a request to send something out',
      });
    }
    for (const value of acceptedValues(node)) {
      if (typeof value === 'string' && OUTBOUND_VALUE.test(value)) {
        findings.push({
          path: path.join('.') || '(root)',
          problem: `accepts «${value}»`,
        });
      }
    }
    if (key && MODE_KEY.test(key) && isFreeText(node)) {
      findings.push({
        path: path.join('.'),
        problem: 'is free text where a mode or status is chosen',
      });
    }
  });
  return findings;
};

/**
 * Rule 3 (correctness review W1 F16): a `confirm` input is taken as the model
 * wrote it. The approval fingerprint is computed from the stored raw call by
 * the door and from the parsed input by `beforeToolCall`; a default, a
 * transform, a preprocess or a string rewrite (`trim`, case) would make the
 * two differ and refuse every approved call — or, worse, run something other
 * than what the card showed.
 */
const REWRITING_STRING_CHECKS = ['trim', 'toLowerCase', 'toUpperCase'];

export const rewritingFindings = (schema: z.ZodTypeAny): Finding[] => {
  const findings: Finding[] = [];
  walk(schema, (node, path) => {
    const def = node._def as Record<string, any>;
    const where = path.join('.') || '(root)';
    switch (typeName(node)) {
      case 'ZodDefault':
      case 'ZodCatch':
        findings.push({ path: where, problem: 'fills in a value the model did not send' });
        return;
      case 'ZodEffects':
        if (def.effect?.type !== 'refinement') {
          findings.push({ path: where, problem: 'transforms what the model sent' });
        }
        return;
      case 'ZodPipeline':
        findings.push({ path: where, problem: 'pipes the input into another shape' });
        return;
      case 'ZodString':
        for (const check of def.checks ?? []) {
          if (REWRITING_STRING_CHECKS.includes(check.kind)) {
            findings.push({ path: where, problem: `rewrites the string (${check.kind})` });
          }
        }
        return;
      default:
        return;
    }
  });
  return findings;
};

const describe = (id: string, rule: string, findings: Finding[]) =>
  `Capability ${id} ${rule}: ${findings
    .map((finding) => `${finding.path} ${finding.problem}`)
    .join('; ')}`;

/** Throws when a declaration breaks either rule. */
export const assertCapabilityInput = (
  capability: Pick<
    CapabilityDeclaration,
    'id' | 'input' | 'risk' | 'resumeSchema'
  >
) => {
  const schemas = [capability.input, capability.resumeSchema].filter(
    Boolean
  ) as z.ZodTypeAny[];
  for (const schema of schemas) {
    const identity = identityFindings(schema);
    if (identity.length) {
      throw new Error(describe(capability.id, 'takes identity from the model', identity));
    }
    if (capability.risk === 'confirm' && schema === capability.input) {
      const rewriting = rewritingFindings(schema);
      if (rewriting.length) {
        throw new Error(
          describe(capability.id, 'rewrites an approved input', rewriting)
        );
      }
    }
    if (!OUTBOUND_ALLOWED.includes(capability.risk)) {
      const outbound = outboundFindings(schema);
      if (outbound.length) {
        throw new Error(
          describe(capability.id, 'could send a post out without a card', outbound)
        );
      }
    }
  }
};
