import React from 'react';
import { MobileIntegration } from '@contentfactory/frontend/components/new-layout/mobile.integration';
import { ProviderAddSurface } from '@contentfactory/frontend/app/(provider)/provider/add/provider-add.surface';

export default async function Page() {
  return <ProviderAddSurface state="default"><MobileIntegration /></ProviderAddSurface>;
}
