'use client';

import { EventEmitter } from 'events';
import { useEffect, useState } from 'react';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
export const supportEmitter = new EventEmitter();

/**
 * A button to the product's support channel, and nothing else.
 *
 * Two things used to be here. A hosted chat widget, which carried the donor
 * company's bot id, so our users' conversations would have arrived at their
 * support desk and been stored by a third-party AI service; it is deleted and
 * does not come back. And a link to the upstream project's own community chat,
 * which was the only thing the old `NEXT_PUBLIC_DISCORD_SUPPORT` ever named.
 *
 * The variable is now `NEXT_PUBLIC_SUPPORT_URL`, because the channel is a
 * decision, not a product — telegram, email, anything. It is unset, so no
 * button renders until someone sets it: an absent button is honest, a button
 * leading to somebody else's community is not. See content-factory-next-ry5.5.
 */
export const Support = () => {
  const [show, setShow] = useState(true);
  const { supportUrl } = useVariables();
  const t = useT();

  useEffect(() => {
    supportEmitter.on('change', setShow);
    return () => {
      supportEmitter.off('state', setShow);
    };
  }, []);

  if (!supportUrl || !show) return null;
  return (
    <div
      id="support-channel"
      className="bg-customColor39 w-[194px] h-[58px] fixed end-[20px] bottom-[20px] z-[500] text-[16px] text-customColor40 rounded-full !rounded-br-[0] cursor-pointer flex justify-center items-center gap-[10px]"
      onClick={() => window.open(supportUrl)}
    >
      <div>
        <svg
          width="32"
          height="33"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-[4px]"
        >
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>{t('support', 'Support')}</div>
    </div>
  );
};
