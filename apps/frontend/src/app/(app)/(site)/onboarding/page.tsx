export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { OnboardingWalkthrough } from '@contentfactory/frontend/components/onboarding/onboarding.walkthrough';

export const generateMetadata = pageTitle('where_to_start', 'Where to start');

export default async function Page() {
  return <OnboardingWalkthrough />;
}
