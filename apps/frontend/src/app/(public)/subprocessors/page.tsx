import type { Metadata } from 'next';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
import { LegalPage } from '@contentfactory/frontend/components/public-saas/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('public_saas_legal_subprocessors') };
}

export default function SubprocessorsPage() {
  return <LegalPage documentId="subprocessors" />;
}
