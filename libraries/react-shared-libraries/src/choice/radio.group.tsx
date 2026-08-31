'use client';

import {
  createContext,
  DetailedHTMLProps,
  forwardRef,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { ControlButton, ControlButtonProps } from './control.button';
import {
  ChoiceOrientation,
  directionForKey,
  enabledOptionNodes,
  OPTION_ATTRIBUTE,
  optionValue,
  resolveTarget,
  useRovingTabStop,
  VALUE_ATTRIBUTE,
} from './roving';

/**
 * One choice out of a small, always-visible set — a plan, a billing period, a
 * date range, an authentication method.
 *
 * Selection follows focus, which is what makes this a radio group rather than
 * a tab list: an arrow key both moves and chooses. Use it only where choosing
 * is cheap and reversible. If picking an option navigates, uploads or reloads,
 * the user needs to arrive before they commit — that is a menu, not this.
 */

type RadioGroupContextValue = {
  value: string | null;
  select: (value: string) => void;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

type RadioGroupProps = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  'onChange' | 'role'
> & {
  value: string | null;
  onChange: (value: string) => void;
  /** Which arrows walk the group. Both axes by default, as the pattern asks. */
  orientation?: ChoiceOrientation;
  children: ReactNode;
};

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    { value, onChange, orientation = 'both', children, onKeyDown, ...props },
    forwardedRef
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useRovingTabStop(
      containerRef,
      (node) => node.getAttribute('aria-checked') === 'true'
    );

    const context = useMemo<RadioGroupContextValue>(
      () => ({ value, select: onChange }),
      [value, onChange]
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      const direction = directionForKey(event.key, orientation);
      if (!direction) return;
      const nodes = enabledOptionNodes(containerRef.current);
      const target = resolveTarget(
        nodes,
        (event.target as Element)?.closest?.(`[${OPTION_ATTRIBUTE}]`) ?? null,
        direction
      );
      if (!target) return;
      event.preventDefault();
      target.focus();
      const next = optionValue(target);
      if (next !== null && next !== value) onChange(next);
    };

    return (
      <div
        {...props}
        role="radiogroup"
        onKeyDown={handleKeyDown}
        ref={(element) => {
          containerRef.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
      >
        <RadioGroupContext.Provider value={context}>
          {children}
        </RadioGroupContext.Provider>
      </div>
    );
  }
);

type RadioOptionProps = Omit<
  ControlButtonProps,
  'mobileTouchTarget' | 'value' | 'role'
> & {
  value: string;
};

export const RadioOption = forwardRef<HTMLButtonElement, RadioOptionProps>(
  ({ value, onClick, ...props }, ref) => {
    const group = useContext(RadioGroupContext);
    if (!group) {
      throw new Error('RadioOption must be rendered inside a RadioGroup');
    }
    const checked = group.value === value;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      group.select(value);
    };

    return (
      <ControlButton
        {...props}
        {...{ [OPTION_ATTRIBUTE]: '', [VALUE_ATTRIBUTE]: value }}
        mobileTouchTarget
        ref={ref}
        role="radio"
        aria-checked={checked}
        tabIndex={checked ? 0 : -1}
        onClick={handleClick}
      />
    );
  }
);
