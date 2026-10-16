'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Tabs, Tab, TabList, TabPanel } from '@contentfactory/react/choice/tabs';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { OpeningBand } from '@contentfactory/react/layout';

const CHAT_MIN = 400;
const MATERIAL_MIN = 480;
const SPLIT_MIN = 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Layout only: both panes stay mounted across resizing, hiding and compact switching. */
export function AgentWorkspaceShell({
  children, material, materialName, materialActions, hasMaterial, hidden,
  contextual = false, selectionVersion, onHide,
}: {
  children: ReactNode;
  material: ReactNode;
  materialName: string;
  materialActions?: ReactNode;
  hasMaterial: boolean;
  hidden: boolean;
  contextual?: boolean;
  /** Changes only for an explicit selection, which may open Material on a phone. */
  selectionVersion: number;
  onHide: () => void;
}) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(0.44);
  const [expanded, setExpanded] = useState(false);
  const [compactTab, setCompactTab] = useState('chat');
  const chatId = useId();
  const materialId = useId();
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    if (selectionVersion) setCompactTab('material');
  }, [selectionVersion]);
  useEffect(() => {
    if (hidden) { setCompactTab('chat'); setExpanded(false); }
  }, [hidden]);

  const wide = width >= SPLIT_MIN;
  const showMaterial = hasMaterial && !hidden && !contextual;
  const minRatio = width ? CHAT_MIN / width : 0.32;
  const maxRatio = width ? 1 - MATERIAL_MIN / width : 0.6;
  const currentRatio = clamp(ratio, minRatio, Math.max(minRatio, maxRatio));
  const chatHidden = showMaterial && (wide ? expanded : compactTab === 'material');
  const materialHidden = !showMaterial || !wide && compactTab !== 'material';

  return (
    <div ref={container} data-assistant-layout={wide ? 'split' : 'compact'} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tabs value={compactTab} onChange={setCompactTab}>
        <TabList aria-label={t('agent', 'AI assistant')} style={{ display: !wide && showMaterial ? undefined : 'none' }} className="flex shrink-0 gap-[4px] border-b border-cf-border bg-cf-surface px-[12px] py-[8px]">
          <Tab value="chat" className="min-w-0 flex-1 rounded-[8px] px-[12px] py-[8px] cf-label-md text-cf-ink aria-selected:bg-cf-accent-soft aria-selected:text-cf-accent">{t('assistant_chat', 'Chat')}</Tab>
          <Tab value="material" className="min-w-0 flex-1 truncate rounded-[8px] px-[12px] py-[8px] cf-label-md text-cf-ink aria-selected:bg-cf-accent-soft aria-selected:text-cf-accent" title={materialName}>{t('assistant_material', 'Material')} · {materialName}</Tab>
        </TabList>
        <div className="flex min-h-0 min-w-0 flex-1">
          <TabPanel value="chat" style={{ display: chatHidden ? 'none' : undefined, flex: wide && showMaterial ? `0 0 ${currentRatio * 100}%` : '1 1 0%' }} className="flex min-h-0 min-w-0 flex-col bg-cf-canvas">
            <div id={chatId} className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </TabPanel>
          {wide && showMaterial && !expanded ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('assistant_resize', 'Resize chat')}
              aria-controls={`${chatId} ${materialId}`}
              aria-valuemin={Math.round(minRatio * 100)}
              aria-valuemax={Math.round(maxRatio * 100)}
              aria-valuenow={Math.round(currentRatio * 100)}
              tabIndex={0}
              className="relative w-[8px] shrink-0 cursor-col-resize touch-none bg-cf-canvas before:absolute before:inset-y-0 before:start-1/2 before:w-px before:bg-cf-border hover:before:bg-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
              onKeyDown={(event) => {
                const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
                const delta = event.key === 'ArrowLeft' ? -0.025 : event.key === 'ArrowRight' ? 0.025 : 0;
                if (delta || event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  setRatio(event.key === 'Home' ? minRatio : event.key === 'End' ? maxRatio : clamp(currentRatio + delta * (rtl ? -1 : 1), minRatio, maxRatio));
                }
              }}
              onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); } }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const bounds = container.current?.getBoundingClientRect();
                if (!bounds?.width) return;
                const x = getComputedStyle(event.currentTarget).direction === 'rtl' ? bounds.right - event.clientX : event.clientX - bounds.left;
                setRatio(clamp(x / bounds.width, minRatio, maxRatio));
              }}
              onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            />
          ) : null}
          <TabPanel value="material" style={{ display: materialHidden ? 'none' : undefined }} className="flex min-h-0 min-w-0 flex-1 flex-col border-s border-cf-border bg-cf-surface">
            <div id={materialId} className="flex min-h-0 min-w-0 flex-1 flex-col">
              <OpeningBand className="mb-0 shrink-0 gap-[8px] border-b border-cf-border px-[16px]" wrap>
                <h2 className="min-w-0 flex-1 truncate cf-label-md text-cf-ink" title={materialName}>{materialName}</h2>
                {materialActions}
                {wide ? <Button type="button" density="dense" variant="quiet" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? t('assistant_collapse', 'Collapse') : t('assistant_expand', 'Expand')}</Button> : null}
                <Button type="button" density="dense" variant="quiet" onClick={onHide}>{t('assistant_hide', 'Hide')}</Button>
              </OpeningBand>
              <div className="min-h-0 flex-1 overflow-y-auto">{material}</div>
            </div>
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
