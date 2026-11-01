'use client';

import { uniqBy } from 'lodash';
import React, { FC, useMemo, useRef, useState } from 'react';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { UserIcon, DropdownArrowIcon } from '@contentfactory/frontend/components/ui/icons';
import {
  MenuItem,
  Popover,
} from '@contentfactory/frontend/components/ui/layers';

export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
}> = (props) => {
  const { onChange, integrations } = props;
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({
      setCurrent: state.setCurrent,
    }))
  );
  const toaster = useToaster();
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const totalCustomers = useMemo(() => {
    return uniqBy(integrations, (i) => i?.customer?.id).length;
  }, [integrations]);
  if (totalCustomers <= 1) {
    return null;
  }

  return (
    <div className="relative select-none">
      <Button
        ref={anchor}
        type="button"
        variant="secondary"
        aria-label={t('select_customer_tooltip', 'Select Customer')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('select_customer_tooltip', 'Select Customer')}
        onClick={() => setOpen((was) => !was)}
        className="pl-[16px] pr-[12px] aria-expanded:border-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
      >
        <UserIcon />
        <DropdownArrowIcon rotated={open} />
      </Button>
      {open && (
        <Popover anchorRef={anchor} onClose={() => setOpen(false)} placement="bottom-start" className="flex w-[250px] flex-col">
          <div className="cf-label-md text-cf-ink px-[10px] py-[6px]">
            {t('customers', 'Customers')}
          </div>
          {uniqBy(integrations, (u) => u?.customer?.name)
            .filter((f) => f.customer?.name)
            .map((p) => (
              <MenuItem
                onClick={() => {
                  toaster.show(
                    t(
                      'customer_socials_selected',
                      'Customer socials selected'
                    ),
                    'success'
                  );
                  onChange(p.customer?.id);
                  setOpen(false);
                  setCurrent('global');
                }}
                key={p.customer?.id}
              >
                {p.customer?.name}
              </MenuItem>
            ))}
        </Popover>
      )}
    </div>
  );
};
