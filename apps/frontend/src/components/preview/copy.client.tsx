'use client';

import { Button } from '@contentfactory/react/form/button';
import { Toast } from '@contentfactory/frontend/components/ui/layers';
import copy from 'copy-to-clipboard';
import { FC, useCallback, useEffect, useState } from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

export const CopyClient: FC<{ postId?: string }> = ({ postId }) => {
  const t = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 4200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyToClipboard = useCallback(() => {
    const publicUrl = postId
      ? new URL(`/p/${postId}`, window.location.origin).toString()
      : window.location.href.split?.('?')?.shift()!;
    copy(publicUrl);
    setCopied(true);
  }, [postId]);

  return (
    <>
      <Button variant="primary" onClick={copyToClipboard}>
        {t('share_with_a_client', 'Share with a client')}
      </Button>
      {copied && (
        <div className="fixed start-1/2 top-[32px] z-[80] -translate-x-1/2">
          <Toast tone="accent">
            {t('link_copied_to_clipboard', 'Link copied to clipboard')}
          </Toast>
        </div>
      )}
    </>
  );
};
