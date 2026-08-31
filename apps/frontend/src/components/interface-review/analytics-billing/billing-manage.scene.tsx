import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  type InterfaceReviewContext,
} from '../fixture-contract';
import { BillingManageView } from '../../billing/billing-manage.view';

export const scene = defineInterfaceReviewScene({
  id: 'analytics-billing/billing-manage',
  states: [
    'loading',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ],
  fixture: {
    plans: [
      {
        id: 'FREE',
        name: 'Free',
        monthly: 0,
        yearly: 0,
        features: ['Local workspace'],
      },
      {
        id: 'STANDARD',
        name: 'Standard',
        monthly: 29,
        yearly: 278,
        features: ['5 channels'],
      },
      {
        id: 'TEAM',
        name: 'Team',
        monthly: 39,
        yearly: 374,
        features: ['10 channels'],
      },
    ],
    exclusions: {
      empty:
        'A missing subscription is normalized to the FREE plan by the billing product contract.',
    },
  },
});

export function Scene({ context }: { context: InterfaceReviewContext }) {
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <BillingManageView
        state={
          context.state as
            | 'loading'
            | 'default'
            | 'selected'
            | 'success'
            | 'error'
            | 'restricted'
            | 'disabled'
            | 'long-content'
        }
        locale={context.locale}
        plans={scene.fixture.plans}
        currentPlan="STANDARD"
        period="MONTHLY"
        notice={context.state === 'success' ? 'Coupon applied.' : undefined}
      />
    </InterfaceReviewFrame>
  );
}
