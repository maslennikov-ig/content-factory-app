export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { OnboardingWalkthrough } from '@contentfactory/frontend/components/onboarding/onboarding.walkthrough';

export const metadata: Metadata = {
  title: 'Where to start',
  description: '',
};

export default async function Page() {
  return <OnboardingWalkthrough />;
}
