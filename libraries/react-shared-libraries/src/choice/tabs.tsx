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
  useId,
  useMemo,
  useRef,
} from 'react';
import { ControlButton, ControlButtonProps } from './control.button';
import {
  directionForKey,
  enabledOptionNodes,
  OPTION_ATTRIBUTE,
  optionValue,
  resolveTarget,
  useRovingTabStop,
  VALUE_ATTRIBUTE,
} from './roving';

/**
 * A choice that swaps the panel underneath it.
 *
 * The difference from a radio group is what the choice means. A radio group
 * records an answer; a tab list decides which part of the same screen you are
 * looking at. That is why a tab points at its panel with `aria-controls` and
 * the panel names its tab back.
 *
 * Activation is automatic by default, as the pattern recommends for panels
 * that appear without noticeable latency: arrowing along the strip shows each
 * view as you pass it. Set `activation="manual"` where the panel costs a
 * request, so arrows only move focus and Enter or Space commits.
 */

type TabsContextValue = {
  value: string;
  select: (value: string) => void;
  tabId: (value: string) => string;
  panelId: (value: string) => string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabs = (component: string) => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(`${component} must be rendered inside Tabs`);
  }
  return context;
};

export const Tabs = ({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) => {
  const base = useId();
  const context = useMemo<TabsContextValue>(
    () => ({
      value,
      select: onChange,
      tabId: (tab) => `${base}tab-${tab}`,
      panelId: (tab) => `${base}panel-${tab}`,
    }),
    [base, value, onChange]
  );

  return <TabsContext.Provider value={context}>{children}</TabsContext.Provider>;
};

type TabListProps = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  'role'
> & {
  orientation?: 'horizontal' | 'vertical';
  activation?: 'automatic' | 'manual';
  children: ReactNode;
};

export const TabList = forwardRef<HTMLDivElement, TabListProps>(
  (
    {
      orientation = 'horizontal',
      activation = 'automatic',
      children,
      onKeyDown,
      ...props
    },
    forwardedRef
  ) => {
    const tabs = useTabs('TabList');
    const containerRef = useRef<HTMLDivElement | null>(null);

    useRovingTabStop(
      containerRef,
      (node) => node.getAttribute('aria-selected') === 'true'
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
      if (activation !== 'automatic') return;
      const next = optionValue(target);
      if (next !== null && next !== tabs.value) tabs.select(next);
    };

    return (
      <div
        {...props}
        role="tablist"
        aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
        onKeyDown={handleKeyDown}
        ref={(element) => {
          containerRef.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
      >
        {children}
      </div>
    );
  }
);

type TabProps = Omit<ControlButtonProps, 'value' | 'role'> & {
  value: string;
};

export const Tab = forwardRef<HTMLButtonElement, TabProps>(
  ({ value, onClick, ...props }, ref) => {
    const tabs = useTabs('Tab');
    const selected = tabs.value === value;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      tabs.select(value);
    };

    return (
      <ControlButton
        {...props}
        {...{ [OPTION_ATTRIBUTE]: '', [VALUE_ATTRIBUTE]: value }}
        ref={ref}
        id={tabs.tabId(value)}
        role="tab"
        aria-selected={selected}
        // Only the visible panel exists in the tree, so only the selected tab
        // can point at one. A reference to an element that is not there reads
        // as a broken control rather than a hidden one.
        aria-controls={selected ? tabs.panelId(value) : undefined}
        tabIndex={selected ? 0 : -1}
        onClick={handleClick}
      />
    );
  }
);

type TabPanelProps = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  'role'
> & {
  value: string;
  /** Panels with nothing focusable inside need a tab stop of their own. */
  focusable?: boolean;
};

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ value, focusable, ...props }, ref) => {
    const tabs = useTabs('TabPanel');
    return (
      <div
        {...props}
        ref={ref}
        id={tabs.panelId(value)}
        role="tabpanel"
        aria-labelledby={tabs.tabId(value)}
        tabIndex={focusable ? 0 : undefined}
      />
    );
  }
);
