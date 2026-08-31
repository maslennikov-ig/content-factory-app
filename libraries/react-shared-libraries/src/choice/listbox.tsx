'use client';

import {
  createContext,
  DetailedHTMLProps,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useContext,
  useId,
} from 'react';
import { ControlButton, ControlButtonProps } from './control.button';

/**
 * A suggestion list that belongs to something else that has the focus.
 *
 * The mention list appears while the caret is still in the editor, and the
 * editor keeps every key press. So this list manages no focus and binds no
 * keys: the owner says which option is active and the list reports that to
 * assistive technology through `aria-activedescendant`. Options stay out of
 * the tab sequence — a popup that steals five tab stops from a text editor is
 * worse than no popup at all.
 *
 * For a list the user tabs into and walks themselves, use `RadioGroup` or
 * `MenuList` instead; this one is deliberately passive.
 */

type ListboxContextValue = {
  optionId: (index: number) => string;
};

const ListboxContext = createContext<ListboxContextValue | null>(null);

type ListboxProps = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  'role'
> & {
  /** Index of the option the owner is currently highlighting, if any. */
  activeIndex?: number | null;
  children: ReactNode;
};

export const Listbox = forwardRef<HTMLDivElement, ListboxProps>(
  ({ activeIndex, children, ...props }, ref) => {
    const base = useId();
    const optionId = (index: number) => `${base}option-${index}`;

    return (
      <div
        {...props}
        ref={ref}
        role="listbox"
        aria-activedescendant={
          activeIndex === null || activeIndex === undefined
            ? undefined
            : optionId(activeIndex)
        }
      >
        <ListboxContext.Provider value={{ optionId }}>
          {children}
        </ListboxContext.Provider>
      </div>
    );
  }
);

type ListboxOptionProps = Omit<ControlButtonProps, 'role'> & {
  index: number;
  selected: boolean;
};

export const ListboxOption = forwardRef<HTMLButtonElement, ListboxOptionProps>(
  ({ index, selected, ...props }, ref) => {
    const listbox = useContext(ListboxContext);
    if (!listbox) {
      throw new Error('ListboxOption must be rendered inside a Listbox');
    }

    return (
      <ControlButton
        {...props}
        ref={ref}
        id={listbox.optionId(index)}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
      />
    );
  }
);
