'use client';

import type { InterfaceReviewContext } from '../interface-review/fixture-contract';
import { defineInterfaceReviewScene } from '../interface-review/fixture-contract';
import {
  CONTENT_INTELLIGENCE_REVIEW_STATES,
  ContentIntelligenceReviewScene,
  contentIntelligenceFixture,
} from './content-intelligence.review-scenes';

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/provenance',
  fixture: contentIntelligenceFixture,
  states: CONTENT_INTELLIGENCE_REVIEW_STATES,
});

export function Scene({ context }: { context: InterfaceReviewContext }) {
  return (
    <ContentIntelligenceReviewScene sceneName="provenance" context={context} />
  );
}
