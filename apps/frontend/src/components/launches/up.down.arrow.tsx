import { FC, useCallback } from 'react';
import { ChevronUpIcon } from '@contentfactory/frontend/components/ui/icons';
import { Button } from '@contentfactory/react/form/button';

const Arrow: FC<{
  flip: boolean;
}> = (props) => {
  const { flip } = props;
  return (
    <ChevronUpIcon
      style={{
        transform: !flip ? 'rotate(180deg)' : '',
      }}
    />
  );
};
export const UpDownArrow: FC<{
  isUp: boolean;
  isDown: boolean;
  onChange: (type: 'up' | 'down') => void;
}> = (props) => {
  const { isUp, isDown, onChange } = props;
  const changePosition = useCallback(
    (type: 'up' | 'down') => () => {
      onChange(type);
    },
    []
  );
  // An arrow with nowhere to go is `disabled` rather than merely unclickable.
  // `pointer-events-none` only takes the mouse away: the control stayed in the
  // tab order and Enter still moved the post, which a keyboard or screen reader
  // user had no way to tell from a live one. `Button` already dims and
  // re-cursors a disabled control, so the greyed-out look is unchanged.
  return (
    <div className="flex flex-col gap-[8px] pt-[8px]">
      <Button
        iconOnly
        size={20}
        aria-label="Move up"
        variant="quiet"
        disabled={!isUp}
        onClick={changePosition('up')}
        className="outline-none flex justify-center items-center"
      >
        <Arrow flip={true} />
      </Button>
      <Button
        iconOnly
        size={20}
        aria-label="Move down"
        variant="quiet"
        disabled={!isDown}
        onClick={changePosition('down')}
        className="outline-none rounded-bl-[20px] flex justify-center items-center"
      >
        <Arrow flip={false} />
      </Button>
    </div>
  );
};
