import { PublicInfoPage } from '@contentfactory/frontend/components/public-saas/public-info-page';

export default function ProductPage() {
  return (
    <PublicInfoPage
      titleKey="productTitle"
      bodyKey="productBody"
      items={[
        { titleKey: 'availableTitle', bodyKey: 'availableBody' },
        { titleKey: 'roadmapTitle', bodyKey: 'roadmapBody' },
      ]}
    />
  );
}
