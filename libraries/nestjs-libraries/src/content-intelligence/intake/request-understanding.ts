import { z } from 'zod';

/** Meaning is supplied by the existing model, never inferred from a phrase list. */
export const INTAKE_UNDERSTANDING_VERSION = 'intake-request/v1' as const;

// Keep the lexical shape in JSON Schema for constrained model decoding; the
// refinement additionally rejects impossible calendar days at the boundary.
const machineDatePattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
const machineDate = z.string().max(80).regex(machineDatePattern).refine(value => {
  const day = value.slice(0, 10);
  return Number.isFinite(Date.parse(value)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}, 'Expected an explicit valid YYYY-MM-DD date or ISO timestamp with timezone');

export const intakeTemporalConstraintSchemaV1 = z.object({
  mode: z.enum(['general', 'delta', 'historical', 'recent']),
  eventInterval: z.object({ start: machineDate, end: machineDate }).nullable().optional(),
  priorCoverageEnd: machineDate.nullable().optional(),
  exclusions: z.array(z.string().max(600)).max(20).optional(),
});

export const intakeRequestSchemaV1 = z.object({
  version: z.literal(INTAKE_UNDERSTANDING_VERSION),
  goal: z.string().min(1).max(20_000),
  requestedOutputs: z.array(z.string().max(600)).max(20).optional(),
  materials: z.array(z.object({
    role: z.enum(['reference', 'evidence', 'author_material', 'instruction']),
    origin: z.enum(['user', 'conversation', 'selected_object', 'external']),
    text: z.string().max(40_000),
    sourceUrl: z.string().max(2_048).optional(),
  })).max(20).optional(),
  evidenceNeeds: z.array(z.string().max(1_000)).max(20).optional(),
  constraints: z.object({
    research: z.enum(['allowed', 'required', 'forbidden']).optional(),
    temporal: intakeTemporalConstraintSchemaV1.nullable().optional(),
    requirements: z.array(z.string().max(1_000)).max(20).optional(),
    humanFactSelection: z.boolean().describe('True only if the request explicitly requires a human (the user or their designated reviewer) to choose or approve the research facts before writing. The assistant researching or verifying sources, choosing supported passages, or reading/checking its saved result does not require human selection. This describes an outstanding human action, never evidence of approval.').optional(),
    title: z.string().max(500).optional(),
  }).strict().optional(),
  unresolvedChoices: z.array(z.string().max(1_000)).max(20).optional(),
}).strict();

export type IntakeUnderstandingV1 = z.infer<typeof intakeRequestSchemaV1>;
export type IntakeTemporalConstraintV1 = z.infer<typeof intakeTemporalConstraintSchemaV1>;

// Structured Outputs represents an absent value as null. The HTTP/tool
// contract stays optional; normalize only the model-output boundary.
export const intakeModelTemporalSchemaV1 = intakeTemporalConstraintSchemaV1.extend({
  exclusions: intakeTemporalConstraintSchemaV1.shape.exclusions.unwrap().nullish(),
});
const constraints = intakeRequestSchemaV1.shape.constraints.unwrap();
export const intakeModelRequestSchemaV1 = intakeRequestSchemaV1.extend({
  requestedOutputs: intakeRequestSchemaV1.shape.requestedOutputs.unwrap().nullish(),
  evidenceNeeds: intakeRequestSchemaV1.shape.evidenceNeeds.unwrap().nullish(),
  unresolvedChoices: intakeRequestSchemaV1.shape.unresolvedChoices.unwrap().nullish(),
  materials: z.array(intakeRequestSchemaV1.shape.materials.unwrap().element.extend({
    sourceUrl: z.string().max(2_048).nullish(),
  })).max(20).nullish(),
  constraints: constraints.extend({
    research: constraints.shape.research.unwrap().nullish(),
    temporal: intakeModelTemporalSchemaV1.nullish(),
    requirements: constraints.shape.requirements.unwrap().nullish(),
    humanFactSelection: constraints.shape.humanFactSelection.unwrap().nullish(),
    title: constraints.shape.title.unwrap().nullish(),
  }).nullish(),
});

const withoutAbsentModelFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutAbsentModelFields);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== null).map(([key, item]) => [key, withoutAbsentModelFields(item)]));
  return value;
};

export const parseModelIntakeUnderstanding = (value: unknown): IntakeUnderstandingV1 | null => {
  const model = intakeModelRequestSchemaV1.safeParse(value);
  return model.success ? parseIntakeUnderstanding(withoutAbsentModelFields(model.data)) : null;
};

export const parseModelIntakeTemporal = (value: unknown): IntakeTemporalConstraintV1 | null => {
  const model = intakeModelTemporalSchemaV1.safeParse(value);
  if (!model.success) return null;
  const parsed = intakeTemporalConstraintSchemaV1.safeParse(withoutAbsentModelFields(model.data));
  return parsed.success ? parsed.data : null;
};

/** A labelled source URL is input material; reading it does not enable search. */
export type IntakeSourceMaterialV1 = {
  role: 'reference' | 'evidence';
  origin: NonNullable<IntakeUnderstandingV1['materials']>[number]['origin'];
  sourceUrl: string;
};
export type IntakeMaterialReadV1 = IntakeSourceMaterialV1 & {
  status: 'read' | 'unreadable' | 'limit';
  evidenceId?: string;
};

/** Model output and HTTP/tool input use the same bounded, consumed contract. */
export const parseIntakeUnderstanding = (value: unknown): IntakeUnderstandingV1 | null => {
  const parsed = intakeRequestSchemaV1.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export type IntakeResearchSelectionV1 = {
  origin: 'person' | 'model';
  selectedKeys: string[];
  selectedAt: string;
};
