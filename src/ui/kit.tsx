// Componentes reutilizables de la interfaz.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Kind, Occ } from '../lib/types';
import { KIND_LABEL } from '../lib/schedule';
import * as Icon from './icons';

export function Sheet({ title, onClose, children, closing }: { title?: string; onClose: () => void; children: ReactNode; closing?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={'sheet-backdrop' + (closing ? ' closing' : '')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="sheet-grip" />
        {title && (
          <div className="row-between">
            <h2 className="h2" style={{ fontSize: 20 }}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <Icon.X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Controla el cierre animado de una hoja. */
export function useClosable(onDone: () => void, ms = 220) {
  const [closing, setClosing] = useState(false);
  const close = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      onDone();
      after?.();
    }, ms);
  };
  return { closing, close };
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function CheckButton({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button className="check" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange}>
      {checked && <Icon.Check size={14} />}
    </button>
  );
}

export function KindBadge({ kind, label }: { kind: Kind; label?: string }) {
  return <span className={'badge k-' + kind}>{label ?? KIND_LABEL[kind]}</span>;
}

export function EventItem({ o, onClick }: { o: Occ; onClick?: () => void }) {
  return (
    <button className={'ev k-' + o.kind} onClick={onClick} aria-label={o.title + ', ' + o.start + ' a ' + o.end}>
      <span className="ev-time">
        {o.start}
        <br />
        <span style={{ color: 'var(--fg3)' }}>{o.end}</span>
      </span>
      <span className="ev-body">
        <span className="ev-kind">
          <span className="kdot" />
          {o.source === 'bloque' ? 'Bloque automático' : KIND_LABEL[o.kind]}
        </span>
        <span className="ev-title">{o.title}</span>
        {o.sub && o.source !== 'bloque' && <span className="ev-sub">{o.sub}</span>}
      </span>
    </button>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card-flat stack center" style={{ padding: '20px 16px', alignItems: 'center' }}>
      <div className="h3">{title}</div>
      {body && <div className="small muted">{body}</div>}
      {action}
    </div>
  );
}

export function initials(name: string): string {
  return name
    .replace(/^(dra?|ing|msc|mgs|phd|lic)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function BackHeader({ title, eyebrow, onBack, right }: { title: string; eyebrow?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="head-back">
      <button className="icon-btn" onClick={onBack} aria-label="Volver">
        <Icon.Back size={18} />
      </button>
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h1" style={{ fontSize: 24, marginTop: 2 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}
