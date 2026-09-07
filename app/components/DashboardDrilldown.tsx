'use client';

import { useEffect, useRef } from 'react';

export type DrilldownTone = 'purple' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'muted';

export type DrilldownItem = {
  id: string;
  title: string;
  meta: string;
  detail?: string;
  value: string;
  tone?: DrilldownTone;
};

export type DrilldownGroup = {
  id: string;
  label: string;
  countLabel: string;
  tone?: DrilldownTone;
  items: DrilldownItem[];
};

export type DashboardDrilldownData = {
  index: string;
  title: string;
  periodLabel: string;
  metric: string;
  metricLabel: string;
  formula: string;
  accent: 'yellow' | 'orange' | 'blue' | 'purple' | 'green';
  groups: DrilldownGroup[];
};

export function DashboardDrilldown({ data, onClose }: { data: DashboardDrilldownData; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="dashboard-drilldown-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={`dashboard-drilldown drilldown-${data.accent}`} role="dialog" aria-modal="true" aria-labelledby="dashboard-drilldown-title">
      <header>
        <div><span>{data.index} / CASE FILE</span><h2 id="dashboard-drilldown-title">{data.title}</h2><p>{data.periodLabel}</p></div>
        <div className="drilldown-metric"><strong>{data.metric}</strong><span>{data.metricLabel}</span></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭战报档案">×</button>
      </header>
      <div className="drilldown-formula"><span>COMBAT FORMULA</span><strong>{data.formula}</strong></div>
      <div className="drilldown-groups">
        {data.groups.map((group, groupIndex) => <section key={group.id} className={`drilldown-group tone-${group.tone ?? 'muted'}`}>
          <header><span>{String(groupIndex + 1).padStart(2, '0')}</span><strong>{group.label}</strong><small>{group.countLabel}</small></header>
          <div>{group.items.length ? group.items.map((item) => <article key={item.id} className={`drilldown-item tone-${item.tone ?? 'muted'}`}>
            <i aria-hidden="true" />
            <div><strong>{item.title}</strong><span>{item.meta}</span>{item.detail && <small>{item.detail}</small>}</div>
            <b>{item.value}</b>
          </article>) : <p className="drilldown-empty">NO RECORDS / 本组没有记录</p>}</div>
        </section>)}
      </div>
      <footer><span>ESC / CLICK OUTSIDE TO CLOSE</span><button type="button" onClick={onClose}>CLOSE FILE</button></footer>
    </section>
  </div>;
}
