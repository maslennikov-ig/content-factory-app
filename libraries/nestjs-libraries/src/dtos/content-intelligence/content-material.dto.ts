import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * What the material routes accept.
 *
 * The platform list is written out rather than imported as a type, because a
 * validator has to exist at runtime and a type does not. `RECUT_PLATFORMS` in
 * `materials/material-presentation.ts` is the same list read from
 * `PLATFORM_SHAPES`, and `tests/content-material.routes.test.cjs` holds the two
 * against each other.
 */
export const RECUT_PLATFORM_VALUES = [
  'site',
  'telegram',
  'vk',
  'newsletter',
] as const;

export class MaterialRecutDto {
  @IsIn(RECUT_PLATFORM_VALUES)
  platform: (typeof RECUT_PLATFORM_VALUES)[number];
}

export class MaterialDraftDto {
  @IsIn(RECUT_PLATFORM_VALUES)
  platform: (typeof RECUT_PLATFORM_VALUES)[number];

  /**
   * Which channel the draft belongs to. Omitted, the workspace's own channel
   * for that platform is used — and a workspace with none is told so by name
   * rather than handed a draft attached to whatever was first in the list.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrationId?: string;
}
