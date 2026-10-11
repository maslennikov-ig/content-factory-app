/** Pure metadata shared by operational decorators and socket-free help. */
export const commandCatalog = {
  configuration: {
    command: 'config:check',
    describe: 'Checks your configuration (.env) file for issues.',
  },
  refresh: { command: 'refresh', describe: 'Refresh all tokens' },
  prune: {
    command: 'product-events:prune [days]',
    describe: 'Delete product events older than the retention window',
  },
  rerender: {
    command: 'adaptations:rerender-bold',
    describe:
      'Re-render DRAFT posts of adaptations whose stored body has bold markers (dry run by default)',
  },
  strip: {
    command: 'adaptations:strip-citation-labels',
    describe:
      'Remove source labels such as [E2] from DRAFT adaptations and their machine-rendered posts (dry run by default)',
  },
};

export const configurationStrictOption = {
  name: 'strict',
  describe: 'Exit with code 1 when configuration issues are found (offline)',
  type: 'boolean' as const,
  default: false,
};

export const rerenderApplyOption = {
  name: 'apply',
  describe: 'Write the re-rendered posts; without it nothing is written',
  type: 'boolean' as const,
  default: false,
};
export const stripApplyOption = {
  name: 'apply',
  describe: 'Write the cleaned bodies and posts; without it nothing is written',
  type: 'boolean' as const,
  default: false,
};
export const adaptationDryRunOption = {
  name: 'dry-run',
  describe:
    'Show what would change and write nothing. This is what happens without --apply; passing both keeps the safe side',
  type: 'boolean' as const,
  default: false,
};
