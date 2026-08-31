import { PublicInfoPage } from '@contentfactory/frontend/components/public-saas/public-info-page';

export default function SecurityPage() {
  return (
    <PublicInfoPage
      titleKey="securityTitle"
      bodyKey="securityBody"
      items={[
        { titleKey: 'tenantIsolationTitle', bodyKey: 'tenantIsolationBody' },
        { titleKey: 'encryptedKeysTitle', bodyKey: 'encryptedKeysBody' },
        { titleKey: 'backupRecoveryTitle', bodyKey: 'backupRecoveryBody' },
        { titleKey: 'deletionExportTitle', bodyKey: 'deletionExportBody' },
        { titleKey: 'securityLimitsTitle', bodyKey: 'securityLimitsBody' },
      ]}
    />
  );
}
