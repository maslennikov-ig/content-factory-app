import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Loading from '@contentfactory/frontend/components/layout/loading';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { timer } from '@contentfactory/helpers/utils/timer';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useDecisionModal } from '@contentfactory/frontend/components/layout/new-modal';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useFireEvents } from '@contentfactory/helpers/utils/use.fire.events';
export const CheckPayment: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  if (!props.check) {
    return <>{props.children}</>;
  }
  return <CheckPaymentInner {...props} />;
};

export const CheckPaymentInner: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  const [showLoader, setShowLoader] = useState(true);
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useDecisionModal();
  const t = useT();
  const fireEvents = useFireEvents();

  useEffect(() => {
    if (showLoader) {
      document.querySelector('body')?.classList.add('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.add('blur-xs', 'pointer-events-none')
      );
    } else {
      document.querySelector('body')?.classList.remove('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.remove('blur-xs', 'pointer-events-none')
      );
    }
  }, [showLoader]);

  // One poll per mount. `checkSubscription` closes over `modal`, and
  // `useDecisionModal` returns a fresh object literal on every render, so an
  // effect keyed on the callback restarted the poll on each parent render and
  // left the previous never-ending loop running beside it.
  const polling = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const checkSubscription = useCallback(async () => {
    const { status } = await (
      await fetch('/billing/check/' + props.check)
    ).json();
    if (!mounted.current) return;
    if (status === 0) {
      await timer(1000);
      if (!mounted.current) return;
      return checkSubscription();
    }
    if (status === 1) {
      modal.open({
        title: t('invalid_payment', 'Invalid Payment'),
        onlyApprove: true,
        approveLabel: 'OK',
        description: t(
          'payment_method_validation_failed',
          'We could not validate your payment method, please try again'
        ),
      });
      setShowLoader(false);
    }
    if (status === 2) {
      await fireEvents('purchase', {
        deduplicationKey: `purchase:${props.check}`,
      }).catch(() => undefined);
      setShowLoader(false);
      props.mutate();
    }
  }, [fetch, fireEvents, modal, props.check, props.mutate, t]);
  useEffect(() => {
    if (polling.current) return;
    polling.current = true;
    checkSubscription();
  }, [checkSubscription]);
  if (showLoader) {
    return (
      <div className="fixed bg-black/40 w-full h-full flex justify-center items-center z-[400]">
        <div>
          <Loading
            type="spin"
            color="var(--cf-accent)"
            height={250}
            width={250}
          />
        </div>
      </div>
    );
  }
  return props.children;
};
