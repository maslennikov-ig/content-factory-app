'use client';

import { useState } from 'react';
import { ContentIntelligenceCitationSelector } from '@contentfactory/frontend/components/new-launch/editor';
import { ProvenanceLine } from '@contentfactory/frontend/components/new-launch/provenance.line';
import type { ContentIntelligenceProvenance } from '@contentfactory/frontend/components/new-launch/store';

const readyContext: ContentIntelligenceProvenance = Object.freeze({
  contentContextSnapshotId: 'synthetic-context-ready',
  brandProfileVersionId: 'synthetic-profile-v4',
  brandProfileSelection: Object.freeze({
    mode: 'resolved',
    versionId: 'synthetic-profile-v4',
    versionNumber: 4,
    contentDigest: 'synthetic-digest-v4',
  }),
  contentContextStatus: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  selectionHash: 'synthetic-selection-ready',
  errorCode: null,
  builtAt: '2026-08-20T10:00:00.000Z',
  expiresAt: '2026-08-21T10:00:00.000Z',
  profileLabel: 'Editorial voice',
  validationStatus: 'VALID',
  availableCitations: Object.freeze([
    Object.freeze({
      citationId: 'F1',
      kind: 'FACT' as const,
      label: 'The release window is Tuesday morning.',
      freshUntil: '2026-08-21T09:00:00.000Z',
    }),
    Object.freeze({
      citationId: 'E1',
      kind: 'EVIDENCE' as const,
      label: 'Product handbook',
      retrievedAt: '2026-08-20T09:30:00.000Z',
    }),
  ]),
});

const neutralContext: ContentIntelligenceProvenance = Object.freeze({
  contentContextSnapshotId: 'synthetic-context-neutral',
  brandProfileVersionId: null,
  brandProfileSelection: Object.freeze({
    mode: 'neutral_fallback',
    reason: 'NO_PROFILE',
  }),
  contentContextStatus: 'UNAVAILABLE',
  generationPolicy: 'ALLOW_USER_ONLY',
  selectionHash: 'synthetic-selection-neutral',
  errorCode: null,
  builtAt: '2026-08-20T10:00:00.000Z',
  expiresAt: '2026-08-21T10:00:00.000Z',
  availableCitations: Object.freeze([]),
});

export default function ConsumerContentIntelligenceReviewPage() {
  const [selected, setSelected] = useState<string[]>(['F1']);
  return (
    <main
      className="min-h-screen bg-cf-canvas p-[24px] text-cf-ink"
      data-consumer-content-intelligence-review="true"
      data-review-source="synthetic"
      data-review-network="disabled"
      data-review-persistence="disabled"
    >
      <div className="mx-auto flex max-w-[960px] flex-col gap-[24px]">
        <header>
          <h1 className="cf-heading-lg text-balance">
            Draft provenance review
          </h1>
          <p className="cf-body-sm mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
            Deterministic states for the production context summary and citation
            controls. No request or persistence is available on this route.
          </p>
        </header>

        <section
          className="rounded-[12px] border border-cf-border bg-cf-surface p-[16px]"
          aria-labelledby="ready-context-title"
          data-review-state="ready"
        >
          <h2 id="ready-context-title" className="cf-heading-md mb-[12px]">
            Ready provenance
          </h2>
          <ProvenanceLine provenance={readyContext} confirmationCount={1} />
          <ContentIntelligenceCitationSelector
            citations={readyContext.availableCitations}
            selectedCitationIds={selected}
            onChange={(citationId, checked) =>
              setSelected((current) =>
                checked
                  ? [...new Set([...current, citationId])].sort()
                  : current.filter((item) => item !== citationId)
              )
            }
          />
        </section>

        <section
          className="rounded-[12px] border border-cf-border bg-cf-surface p-[16px]"
          aria-labelledby="neutral-context-title"
          data-review-state="neutral"
        >
          <h2 id="neutral-context-title" className="cf-heading-md mb-[12px]">
            Neutral fallback
          </h2>
          <ProvenanceLine provenance={neutralContext} />
        </section>
      </div>
    </main>
  );
}
