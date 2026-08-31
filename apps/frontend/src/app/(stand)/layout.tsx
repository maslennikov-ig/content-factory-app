import '../global.scss';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import {
  InterfaceReviewDocument,
  resolveInterfaceReviewContext,
} from '../../components/interface-review/fixture-contract';
import { assertInterfaceReviewEnvironment } from '../../components/interface-review/review-access';
import { appMono, appSans } from '../../styles/fonts';

export default function StandLayout({ children }: { children: ReactNode }) {
  assertInterfaceReviewEnvironment(process.env.NODE_ENV, notFound);

  return (
    <InterfaceReviewDocument
      sceneId="interface-review"
      context={resolveInterfaceReviewContext({})}
      // The same two vendored faces every other route group applies. Reviewing
      // a screen in the browser's default serif reviews the wrong screen.
      fontClassName={`${appSans.variable} ${appMono.variable} ${appSans.className}`}
    >
      {children}
    </InterfaceReviewDocument>
  );
}
