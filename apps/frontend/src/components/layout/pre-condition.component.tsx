import React, { FC, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModalWrapperComponent } from '@contentfactory/frontend/components/new-launch/modal.wrapper.component';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

export const PreConditionComponentModal: FC = () => {
  const modal = useModals();
  const t = useT();
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="whitespace-pre-line">
        {t(
          'social_channel_connected_elsewhere',
          'This social channel was connected previously to another Content Factory account.\nTo continue, please fast-track your trial for an immediate charge.\n\nPlease be advised that the account will not be eligible for a refund, and the charge is final.'
        )}
      </div>
      <div className="flex gap-[2px] justify-center">
        <Button
          onClick={() => (window.location.href = '/billing?finishTrial=true')}
        >
          {t('fast_track_charge_now', 'Fast track - Charge me now')}
        </Button>
        <Button onClick={modal.closeCurrent} secondary={true}>
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
};
export const PreConditionComponent: FC = () => {
  const modal = useModals();
  const query = useSearchParams();
  const t = useT();
  useEffect(() => {
    if (query.get('precondition')) {
      modal.openModal({
        title: t(
          'suspicious_activity_detected',
          'Suspicious activity detected'
        ),
        withCloseButton: true,
        classNames: {
          modal: 'text-textColor',
        },
        children: <PreConditionComponentModal />,
      });
    }
  }, []);
  return null;
};
