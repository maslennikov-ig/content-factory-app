export const PUBLIC_GROWTH_EVENT_NAMES = [
  'landing_view',
  'demo_started',
  'demo_completed',
  'signup_started',
] as const;

export const TRUSTED_GROWTH_EVENT_NAMES = [
  'registration_completed',
  'workspace_activated',
] as const;

export type PublicGrowthEventName =
  (typeof PUBLIC_GROWTH_EVENT_NAMES)[number];
export type TrustedGrowthEventName =
  (typeof TRUSTED_GROWTH_EVENT_NAMES)[number];

export const PUBLIC_GROWTH_LOCALES = ['ru', 'en'] as const;
export const PUBLIC_GROWTH_WIDTH_RANGES = [
  'small',
  'medium',
  'large',
  'wide',
] as const;
export const PUBLIC_GROWTH_UI_VERSIONS = ['public-demo-v1'] as const;
export const PUBLIC_GROWTH_DEMO_STEPS = [
  'plan',
  'draft',
  'review',
  'schedule',
] as const;

export interface PublicGrowthEvent {
  name: PublicGrowthEventName;
  locale?: (typeof PUBLIC_GROWTH_LOCALES)[number];
  widthRange?: (typeof PUBLIC_GROWTH_WIDTH_RANGES)[number];
  uiVersion?: (typeof PUBLIC_GROWTH_UI_VERSIONS)[number];
  demoStep?: (typeof PUBLIC_GROWTH_DEMO_STEPS)[number];
}

export function parsePublicGrowthEvent(
  value: unknown
): PublicGrowthEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const allowedKeys = new Set([
    'name',
    'locale',
    'widthRange',
    'uiVersion',
    'demoStep',
  ]);
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.includes('name') || keys.some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const name = input.name;
  if (
    typeof name !== 'string' ||
    !(PUBLIC_GROWTH_EVENT_NAMES as readonly string[]).includes(name)
  ) {
    return null;
  }

  const dimensions = [
    ['locale', PUBLIC_GROWTH_LOCALES],
    ['widthRange', PUBLIC_GROWTH_WIDTH_RANGES],
    ['uiVersion', PUBLIC_GROWTH_UI_VERSIONS],
    ['demoStep', PUBLIC_GROWTH_DEMO_STEPS],
  ] as const;
  for (const [key, values] of dimensions) {
    if (
      input[key] !== undefined &&
      (typeof input[key] !== 'string' ||
        !(values as readonly string[]).includes(input[key] as string))
    ) {
      return null;
    }
  }

  return Object.fromEntries(
    keys.map((key) => [key, input[key]])
  ) as unknown as PublicGrowthEvent;
}
