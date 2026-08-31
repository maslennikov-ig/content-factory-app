'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { DelayIcon, DropdownArrowIcon } from '@contentfactory/frontend/components/ui/icons';
import clsx from 'clsx';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';

const delayOptions = [
  { value: 1, label: '1m' },
  { value: 2, label: '2m' },
  { value: 5, label: '5m' },
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
];

export const DelayComponent: FC<{
  currentIndex: number;
  currentDelay: number;
}> = ({ currentIndex, currentDelay }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  
  const isCustomDelay = currentDelay > 0 && !delayOptions.some((opt) => opt.value === currentDelay);

  useEffect(() => {
    if (isOpen && isCustomDelay) {
      setCustomValue(String(currentDelay));
    } else if (isOpen && !isCustomDelay) {
      setCustomValue('');
    }
  }, [isOpen, isCustomDelay, currentDelay]);

  const { current, setInternalDelay, setGlobalDelay } = useLaunchStore(
    useShallow((state) => ({
      current: state.current,
      setGlobalDelay: state.setGlobalDelay,
      setInternalDelay: state.setInternalDelay,
    }))
  );

  const ref = useClickOutside(() => {
    if (!isOpen) {
      return;
    }
    setIsOpen(false);
  });

  const setDelay = useCallback(
    (index: number) => (minutes: number) => {
      if (current !== 'global') {
        return setInternalDelay(current, index, minutes);
      }

      return setGlobalDelay(index, minutes);
    },
    [currentIndex, current]
  );

  const handleSelectDelay = useCallback(
    (minutes: number) => {
      setDelay(currentIndex)(minutes);
      setIsOpen(false);
    },
    [currentIndex, setDelay]
  );

  const getCurrentDelayLabel = () => {
    if (!currentDelay) return null;
    const option = delayOptions.find((opt) => opt.value === currentDelay);
    return option?.label || `${currentDelay} min`;
  };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        data-tooltip-id="tooltip"
        data-tooltip-content={
          !currentDelay
            ? t('delay_comment', 'Delay comment')
            : `${t('delay_comment_by', 'Comment delayed by')} ${getCurrentDelayLabel()}`
        }
        className={clsx(
          'cursor-pointer flex items-center gap-[4px]',
          currentDelay > 0 && 'bg-cf-accent text-cf-accent-ink rounded-full'
        )}
      >
        <DelayIcon />
      </div>
      {isOpen && (
        <div className="z-[300] absolute end-0 top-[100%] w-[200px] bg-newBgColorInner p-[8px] menu-shadow translate-y-[10px] flex flex-col rounded-[8px]">
          <div className="grid grid-cols-4 gap-[4px]">
            {delayOptions.map((option) => (
              <div
                onClick={() => handleSelectDelay(option.value)}
                key={option.value}
                className={clsx(
                  'h-[32px] flex items-center justify-center rounded-[4px] cursor-pointer hover:bg-newBgColor text-[13px]',
                  currentDelay === option.value && 'bg-cf-accent text-cf-accent-ink hover:bg-cf-accent'
                )}
              >
                {option.label}
              </div>
            ))}
          </div>
          <div className="border-t border-newTextColor/10 mt-[8px] pt-[8px]">
            <div className="flex gap-[4px]">
              <Input
                standalone
                density="dense"
                name="custom-delay"
                type="number"
                min="1"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Custom min"
                fieldClassName="flex-1"
                className={clsx(isCustomDelay && 'border-cf-accent')}
                inputClassName="cf-body-sm"
              />
              <Button
                density="dense"
                onClick={(e) => {
                  e.stopPropagation();
                  const value = parseInt(customValue, 10);
                  if (value > 0) {
                    handleSelectDelay(value);
                    setCustomValue('');
                  }
                }}
                className="px-[10px] rounded-[4px] text-[12px] font-[600]"
              >
                Set
              </Button>
            </div>
          </div>
          {currentDelay > 0 && (
            <Button variant="destructive"
              density="dense"
              onClick={() => handleSelectDelay(0)}
              className="mt-[8px] w-full rounded-[4px] text-[13px]"
            >
              Remove delay
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
