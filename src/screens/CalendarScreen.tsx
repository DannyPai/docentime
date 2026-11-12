import { useMemo, useState } from 'react';
import type { Occ } from '../lib/types';
import { useAppState } from '../lib/store';
import { addDays, capitalize, DAYS_SHORT, fromISO, fromMin, longDate, MONTHS, nowTime, shortDate, startOfWeek, toISO, todayISO, toMin, weekday } from '../lib/dates';
import { academicOn, freeWindows, holidaySet, occurrences } from '../lib/schedule';
import { Empty, EventItem } from '../ui/kit';
import { useNav } from '../ui/nav';
import * as Icon from '../ui/icons';

type View = 'dia' | 'semana' | 'mes' | 'agenda';
const ROW = 44;

/** Reparte eventos que se cruzan en columnas paralelas. */
function lanes(occs: Occ[]): { o: Occ; lane: number; lanes: number }[] {
  const out: { o: Occ; lane: number; lanes: number }[] = [];
  let group: { o: Occ; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => out.push({ ...g, lanes: n }));
    group = [];
  };
  for (const o of occs) {
    if (toMin(o.start) >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => toMin(g.o.end) > toMin(o.start)).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ o, lane });
    groupEnd = Math.max(groupEnd, toMin(o.end));
  }
  flush();
  return out;
}

export default function CalendarScreen({ initialDate }: { initialDate?: string }) {
  const s = useAppState();
  const nav = useNav();
  const today = todayISO();
  const [view, setView] = useState<View>('semana');
  const [cursor, setCursor] = useState(initialDate ?? today);
  const { dayStart, dayEnd } = s.settings;
  const startH = Math.floor(toMin(dayStart) / 60);
  const endH = Math.ceil(toMin(dayEnd) / 60);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);

  const ws = startOfWeek(cursor);
  const weekOccs = useMemo(() => occurrences(s, ws, addDays(ws, 6)), [s, ws]);
  const showWeekend = weekOccs.some((o) => weekday(o.date) > 5);
  const days = Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(ws, i));
  const hol = holidaySet(s);

  const step = (dir: number) => {
    if (view === 'dia') setCursor(addDays(cursor, dir));
    else if (view === 'semana' || view === 'agenda') setCursor(addDays(cursor, 7 * dir));
    else {
      const d = fromISO(cursor);
      setCursor(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  const title =
    view === 'mes'
      ? capitalize(MONTHS[fromISO(cursor).getMonth()]) + ' ' + fromISO(cursor).getFullYear()
      : view === 'dia'
        ? capitalize(shortDate(cursor))
        : capitalize(MONTHS[fromISO(ws).getMonth()]) + ' ' + fromISO(ws).getFullYear();

  return (
    <>
      <div className="screen">
        <div className="head">
          <div>
            <div className="eyebrow">{view === 'mes' ? 'Vista mensual' : fromISO(ws).getDate() + ' – ' + shortDate(addDays(ws, showWeekend ? 6 : 4)).replace(/^\S+ /, '')}</div>
            <h1 className="h1">{title}</h1>
          </div>
          <div className="nav-arrows">
            <button className="icon-btn" onClick={() => step(-1)} aria-label="Anterior"><Icon.Left size={18} /></button>
            <button className="icon-btn" onClick={() => step(1)} aria-label="Siguiente"><Icon.Right size={18} /></button>
          </div>
        </div>
        <div className="row">
          <div className="seg grow" role="group" aria-label="Vista">
            {(['dia', 'semana', 'mes', 'agenda'] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{{ dia: 'Día', semana: 'Semana', mes: 'Mes', agenda: 'Agenda' }[v]}</button>
            ))}
          </div>
          {cursor !== today && <button className="chip" onClick={() => setCursor(today)}>Hoy</button>}
        </div>

        <div key={view + (view === 'mes' ? cursor.slice(0, 7) : ws)} className="anim-in stack-lg">
          {view === 'semana' && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="wk-head">
                {days.map((d) => (
                  <button key={d} className={'wk-day' + (d === today ? ' today' : '')} onClick={() => { setCursor(d); setView('dia'); }} aria-label={longDate(d)}>
                    {DAYS_SHORT[weekday(d) - 1]}
                    <span className="wk-num">{fromISO(d).getDate()}</span>
                  </button>
                ))}
              </div>
              {days.some((d) => academicOn(s, d).length) && (
                <div className="wk-allday">
                  {days.map((d) => (
                    <div key={d}>
                      {academicOn(s, d).map((a) => (
                        <span key={a.id} className={'wk-tag' + (a.type === 'feriado' ? ' feriado' : '')} title={a.title}>{a.type === 'notas' ? 'Notas' : a.type === 'feriado' ? 'Feriado' : a.type === 'examen' ? 'Exámenes' : a.title}</span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="wk-grid" style={{ height: hours.length * ROW }}>
                <div className="wk-hours">{hours.map((h) => <div key={h}>{String(h).padStart(2, '0')}</div>)}</div>
                {days.map((d) => {
                  const list = lanes(weekOccs.filter((o) => o.date === d));
                  return (
                    <div
                      key={d}
                      className="wk-col"
                      style={hol.has(d) ? { backgroundColor: 'var(--sf)' } : undefined}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const y = e.nativeEvent.offsetY;
                        const start = fromMin(startH * 60 + Math.floor(y / ROW) * 60);
                        nav.sheet({ type: 'nuevo-evento', date: d, start });
                      }}
                    >
                      {d === today && toMin(nowTime()) >= startH * 60 && toMin(nowTime()) <= endH * 60 && <div className="wk-now" style={{ top: ((toMin(nowTime()) - startH * 60) / 60) * ROW }} />}
                      {list.map(({ o, lane, lanes: n }) => {
                        const top = Math.max(0, ((toMin(o.start) - startH * 60) / 60) * ROW) + 1;
                        const h = Math.max(18, ((toMin(o.end) - Math.max(toMin(o.start), startH * 60)) / 60) * ROW - 3);
                        return (
                          <button
                            key={o.key}
                            className={'wk-ev k-' + o.kind}
                            style={{ top, height: h, left: 2 + (lane * 100) / n + '%', width: 'calc(' + 100 / n + '% - 4px)', right: 'auto' }}
                            onClick={() => nav.sheet({ type: 'evento', occ: o })}
                            aria-label={o.title + ', ' + longDate(o.date) + ', ' + o.start}
                          >
                            {o.title}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="xs muted">Toca un espacio vacío para crear una actividad a esa hora.</div>
            </div>
          )}

          {view === 'dia' && <DayView date={cursor} setDate={setCursor} />}
          {view === 'mes' && <MonthView cursor={cursor} setCursor={setCursor} />}
          {view === 'agenda' && <AgendaView from={ws <= today && today <= addDays(ws, 6) ? today : ws} />}
        </div>
        <div style={{ height: 60 }} />
      </div>
      <button className="fab" onClick={() => nav.sheet({ type: 'nuevo-evento', date: view === 'dia' ? cursor : cursor >= today ? cursor : today })} aria-label="Nueva actividad">
        <Icon.Plus size={26} />
      </button>
    </>
  );
}

function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const s = useAppState();
  const nav = useNav();
  const today = todayISO();
  const ws = startOfWeek(date);
  const occs = useMemo(() => occurrences(s, date, date), [s, date]);
  const free = freeWindows(s, date, 60);
  const academic = academicOn(s, date);
  return (
    <div className="stack-lg">
      <div className="row">
        {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => (
          <button key={d} className="chip grow" style={{ padding: 0, minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }} aria-pressed={d === date} onClick={() => setDate(d)} aria-label={longDate(d)}>
            <span className="xs" style={{ fontWeight: 500 }}>{DAYS_SHORT[weekday(d) - 1]}</span>
            <span style={{ fontSize: 16, fontWeight: 700, textDecoration: d === today && d !== date ? 'underline' : undefined }}>{fromISO(d).getDate()}</span>
          </button>
        ))}
      </div>
      <div className="h3">{capitalize(longDate(date))}{date === today ? ' · hoy' : ''}</div>
      {academic.map((a) => (
        <div key={a.id} className={'allday' + (a.type === 'feriado' ? ' feriado' : '')}><span>{a.title}</span><span className="mono" style={{ color: 'inherit' }}>ESPOCH</span></div>
      ))}
      {occs.length ? occs.map((o) => <EventItem key={o.key} o={o} onClick={() => nav.sheet({ type: 'evento', occ: o })} />) : <Empty title="Día libre" body="No hay actividades registradas." />}
      {free.length > 0 && (
        <div className="card-flat stack">
          <div className="mono">Huecos libres de 1 h o más</div>
          <div className="row wrap">
            {free.map((w) => (
              <button key={w.start} className="chip chip-soft" onClick={() => nav.sheet({ type: 'nuevo-evento', date, start: w.start })}>{w.start} – {w.end}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthView({ cursor, setCursor }: { cursor: string; setCursor: (d: string) => void }) {
  const s = useAppState();
  const nav = useNav();
  const today = todayISO();
  const d = fromISO(cursor);
  const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const occs = useMemo(() => occurrences(s, cells[0], cells[41]), [s, cells[0]]); // eslint-disable-line
  const hol = holidaySet(s);
  const selected = cursor;
  const selOccs = occs.filter((o) => o.date === selected);
  const month = d.getMonth();
  const monthDates = (s.calendar?.fechas ?? []).filter((f) => fromISO(f.date).getMonth() === month && fromISO(f.date).getFullYear() === d.getFullYear());
  return (
    <div className="stack-lg">
      <div className="mo-grid">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => <div key={w} className="mo-dow">{w}</div>)}
        {cells.map((c) => {
          const kinds = Array.from(new Set(occs.filter((o) => o.date === c).map((o) => o.kind))).slice(0, 3);
          const isDeadline = academicOn(s, c).some((a) => a.type === 'notas');
          return (
            <button
              key={c}
              className={['mo-cell', fromISO(c).getMonth() !== month && 'out', c === today && 'today', c === selected && 'sel', isDeadline && 'deadline', hol.has(c) && 'holiday'].filter(Boolean).join(' ')}
              onClick={() => setCursor(c)}
              aria-label={longDate(c) + (kinds.length ? ', con actividades' : '')}
              aria-pressed={c === selected}
            >
              <span>{fromISO(c).getDate()}</span>
              <span className="mo-dots">{kinds.map((k) => <i key={k} className={'k-' + k} />)}</span>
            </button>
          );
        })}
      </div>
      <div className="stack">
        <div className="row-between">
          <div className="h3">{capitalize(longDate(selected))}</div>
          <button className="btn-link" onClick={() => nav.sheet({ type: 'nuevo-evento', date: selected })}>Agregar</button>
        </div>
        {academicOn(s, selected).map((a) => <div key={a.id} className={'allday' + (a.type === 'feriado' ? ' feriado' : '')}><span>{a.title}</span></div>)}
        {selOccs.length ? selOccs.map((o) => <EventItem key={o.key} o={o} onClick={() => nav.sheet({ type: 'evento', occ: o })} />) : <div className="small muted">Sin actividades.</div>}
      </div>
      {monthDates.length > 0 && (
        <div className="stack">
          <div className="eyebrow">Calendario ESPOCH{s.calendar?.esEjemplo ? ' · datos de ejemplo' : ''}</div>
          {monthDates.map((f) => (
            <div key={f.id} className={f.type === 'notas' ? 'allday' : 'li card'} style={f.type === 'notas' ? undefined : { flexDirection: 'row', padding: '10px 14px', minHeight: 0 }}>
              <span style={{ fontWeight: f.type === 'notas' ? 600 : 500 }}>{f.title}</span>
              <span className={f.type === 'notas' ? '' : 'small muted'}>{shortDate(f.date)}{f.endDate ? ' – ' + shortDate(f.endDate) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaView({ from }: { from: string }) {
  const s = useAppState();
  const nav = useNav();
  const today = todayISO();
  const occs = useMemo(() => occurrences(s, from, addDays(from, 13)), [s, from]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i)).filter((d) => occs.some((o) => o.date === d) || academicOn(s, d).length);
  if (!days.length) return <Empty title="Nada en las próximas dos semanas" />;
  return (
    <div className="stack-lg">
      {days.map((d) => (
        <div key={d} className="stack">
          <div className="h3">{capitalize(longDate(d))}{d === today ? ' · hoy' : ''}</div>
          {academicOn(s, d).map((a) => <div key={a.id} className={'allday' + (a.type === 'feriado' ? ' feriado' : '')}><span>{a.title}</span></div>)}
          {occs.filter((o) => o.date === d).map((o) => <EventItem key={o.key} o={o} onClick={() => nav.sheet({ type: 'evento', occ: o })} />)}
        </div>
      ))}
    </div>
  );
}
