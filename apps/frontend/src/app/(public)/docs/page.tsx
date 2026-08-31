import { PublicInfoPage } from '@contentfactory/frontend/components/public-saas/public-info-page';

export default function DocsPage() {
  return (
    <PublicInfoPage
      titleKey="docsTitle"
      bodyKey="docsBody"
      items={[
        { titleKey: 'docsPlanTitle', bodyKey: 'docsPlanBody' },
        { titleKey: 'docsReviewTitle', bodyKey: 'docsReviewBody' },
        { titleKey: 'docsScheduleTitle', bodyKey: 'docsScheduleBody' },
      ]}
    />
  );
}
