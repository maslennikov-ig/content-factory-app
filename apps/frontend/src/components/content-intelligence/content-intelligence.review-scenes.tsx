'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../interface-review/fixture-contract';
import {
  ContentIntelligenceView,
  NOOP_CONTENT_INTELLIGENCE_ACTIONS,
  type ContentIntelligenceData,
  type ContentIntelligenceSection,
} from './content-intelligence.view';

export const CONTENT_INTELLIGENCE_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

export const contentIntelligenceFixture: ContentIntelligenceData = {
  canManage: true,
  sources: [
    {
      id: 'source_product_handbook',
      kind: 'URL',
      displayName: 'Product handbook',
      canonicalUrl: 'https://docs.synthetic.invalid/product/editorial-handbook',
      desiredState: 'ACTIVE',
      healthState: 'FRESH',
      rightsState: 'CONFIRMED',
      robotsState: 'ALLOWED',
      currentSnapshot: {
        observedAt: '2026-08-20T08:30:00.000Z',
        freshUntil: '2026-08-27T08:30:00.000Z',
        evidenceCount: 6,
      },
    },
    {
      id: 'source_release_feed',
      kind: 'RSS',
      displayName: 'Release notes feed',
      canonicalUrl:
        'https://feeds.synthetic.invalid/very/long/localized/path/that/verifies/mobile/wrapping/without/hiding/the/diagnostic',
      desiredState: 'DRAFT',
      healthState: 'POLICY_BLOCKED',
      rightsState: 'CONFIRMED',
      robotsState: 'DISALLOWED',
      currentSnapshot: {
        observedAt: '2026-07-12T06:00:00.000Z',
        freshUntil: '2026-07-19T06:00:00.000Z',
        evidenceCount: 11,
      },
    },
    {
      id: 'source_removed_archive',
      kind: 'URL',
      displayName: 'Archived campaign notes',
      canonicalUrl: null,
      desiredState: 'ARCHIVED',
      healthState: 'ERROR',
      rightsState: 'DENIED',
      robotsState: 'UNKNOWN',
      currentSnapshot: null,
    },
  ],
  sourceCapabilities: { directFetch: true, validate: true, sync: true },
  sourceDraftMaterial: {
    sourceId: 'source_product_handbook',
    snapshotId: 'snapshot_product_handbook',
    evidence: [
      {
        evidenceId: 'evidence_handbook',
        excerpt:
          'Editorial releases are prepared for Tuesday morning after final review.',
        observedAt: '2026-08-20T08:30:00.000Z',
        freshUntil: '2026-08-27T08:30:00.000Z',
        freshnessStatus: 'FRESH',
        provenance: { kind: 'URL', retrievalProvider: 'direct-fetch-v1' },
      },
    ],
    trace: {
      contractVersion: 'source-draft-material/v1',
      builtAt: '2026-08-20T08:31:00.000Z',
    },
  },
  provenance: {
    contextId: 'ctx_01J5SYNTHETIC',
    status: 'BLOCKED_CONFLICT',
    generationPolicy: 'EVIDENCE_REQUIRED',
    errorCode: 'CONTENT_EVIDENCE_REQUIRED',
    profile: {
      mode: 'resolved',
      versionId: 'bpv_editorial_04',
      versionNumber: 4,
    },
    facts: [
      {
        id: 'fact_release_window',
        statement:
          'The documented release window is Tuesday morning in the workspace time zone.',
        status: 'CONFLICT',
        currentRequired: true,
        evidence: [
          {
            id: 'evidence_handbook',
            sourceLabel: 'Product handbook',
            excerpt:
              'Editorial releases are prepared for Tuesday morning after final review.',
            relation: 'SUPPORTS',
            sourceState: 'AVAILABLE',
          },
          {
            id: 'evidence_removed',
            sourceLabel: 'Removed campaign archive',
            excerpt:
              'Excerpt removed with source; the contradiction remains visible as a tombstone.',
            relation: 'CONTRADICTS',
            sourceState: 'SOURCE_REMOVED',
          },
        ],
      },
      {
        id: 'fact_voice',
        statement:
          'Generated drafts must distinguish verified facts from open questions.',
        status: 'VERIFIED',
        currentRequired: false,
        evidence: [
          {
            id: 'evidence_voice',
            sourceLabel: 'Product handbook',
            excerpt:
              'Use a direct statement for known facts and label unresolved details explicitly.',
            relation: 'SUPPORTS',
            sourceState: 'AVAILABLE',
          },
        ],
      },
    ],
    rejected: [
      {
        label: 'Generated provider summary',
        reason:
          'The citation does not name an accepted source evidence record.',
      },
    ],
  },
  provenanceAvailable: true,
};

const createScene = (section: ContentIntelligenceSection) =>
  defineInterfaceReviewScene({
    id: `content-intelligence/${section}`,
    fixture: contentIntelligenceFixture,
    states: CONTENT_INTELLIGENCE_REVIEW_STATES,
  });

export const contentIntelligenceScenes = Object.freeze({
  sources: createScene('sources'),
  provenance: createScene('provenance'),
});

export function ContentIntelligenceReviewScene({
  sceneName,
  context,
}: {
  sceneName: keyof typeof contentIntelligenceScenes;
  context: InterfaceReviewContext;
}) {
  const scene = contentIntelligenceScenes[sceneName];
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <div className="p-[16px] sm:p-[20px] lg:p-[24px]">
        <ContentIntelligenceView
          locale={context.locale}
          activeSection={sceneName}
          state={context.state}
          visibleSections={[sceneName]}
          data={scene.fixture}
          actions={NOOP_CONTENT_INTELLIGENCE_ACTIONS}
        />
      </div>
    </InterfaceReviewFrame>
  );
}
