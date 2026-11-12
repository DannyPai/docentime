import { useMemo, useRef, useState } from 'react';
import type { Kind } from '../lib/types';
import { exportBackup, getState, importBackup, replaceState, resetAll, setState, syncEspoch, toast, updateSettings, useAppState } from '../lib/store';
import { addDays, capitalize, hoursLabel, longDate, shortDate, startOfWeek, todayISO, toMin } from '../lib/dates';
import { courseName, KIND_LABEL, KIND_ORDER, minutesByKind, occurrences, totalMinutes } from '../lib/schedule';
import { exportICS, parseICS, shareFile } from '../lib/ics';
import { demoState } from '../lib/demo';
import { BackHeader, Empty, initials, Sheet, Switch, useClosable } from '../ui/kit';
import { useNav } from '../ui/nav';
import { FACULTIES } from './Onboarding';
import * as Icon from '../ui/icons';

const DESIG: { kind: Kind; label: string }[] = [
  { kind: 'clase', label: 'Clases' },
  { kind: 'comision', label: 'Comisión de Carrera' },
  { kind: 'proyecto', label: 'Investigación / Vinculación' },
  { kind: 'titulacion', label: 'Titulación' }
];

export default function Profile() {
  const s = useAppState();
  const nav = useNav();
  const st = s.settings;
  const [weekOffset, setWeekOffset] = useState(0);
  const [editProfile, setEditProfile] = useState(false);
  const [confirm, setConfirm] = useState<'borrar' | 'demo' | null>(null);
  const icsRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const ws = addDays(startOfWeek(todayISO()), weekOffset * 7);
  const occs = useMemo(() => occurrences(s, ws, addDays(ws, 6)), [s, ws]);
  const mins = minutesByKind(occs);
  const total = totalMinutes(occs);
  const max = Math.max(1, ...KIND_ORDER.map((k) => mins[k]));

  const report = () => {
    const lines = ['Reporte semanal de carga horaria', st.name + ' · ' + st.faculty + (st.career ? ' · ' + st.career : ''), 'Semana del ' + longDate(ws) + ' al ' + longDate(addDays(ws, 6)), ''];
    for (const k of KIND_ORDER) if (mins[k]) lines.push(KIND_LABEL[k] + ': ' + hoursLabel(mins[k]));
    lines.push('Total: ' + hoursLabel(total), '', 'Detalle:');
    for (const o of occs) lines.push(shortDate(o.date) + '  ' + o.start + '–' + o.end + '  ' + KIND_LABEL[o.kind] + '  ' + o.title);
    void shareFile('reporte-semana-' + ws + '.txt', lines.join('\n'), 'text/plain').then((r) => toast(r === 'descargado' ? 'Reporte descargado' : 'Reporte listo para compartir'));
  };

  const importIcs = async (f: File) => {
    const items = parseICS(await f.text());
    if (!items.length) return toast('No encontré eventos con hora en ese archivo');
    setState((x) => ({ ...x, activities: [...x.activities, ...items] }), { undoable: true });
    toast(items.length + ' eventos importados');
  };
  const importJson = async (f: File) => toast(importBackup(await f.text()) ? 'Copia de seguridad restaurada' : 'El archivo no es una copia válida de DocenTime');

  const reminders: { h: number; label: string }[] = [
    { h: 168, label: '1 semana' },
    { h: 72, label: '3 días' },
    { h: 24, label: '24 h' }
  ];
  const notifPerm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  return (
    <div className="screen">
      <div className="row" style={{ gap: 14 }}>
        <span className="avatar" style={{ width: 60, height: 60, fontSize: 20, background: 'var(--red)', color: '#fff', border: 'none', fontFamily: 'var(--display)' }}>{initials(st.name || 'Docente')}</span>
        <div className="grow">
          <h1 className="h1" style={{ fontSize: 22, margin: 0 }}>{st.name || 'Docente'}</h1>
          <div className="small muted">{[st.faculty, st.career].filter(Boolean).join(' · ') || 'Completa tu perfil'}</div>
        </div>
        <button className="icon-btn" onClick={() => setEditProfile(true)} aria-label="Editar perfil"><Icon.Edit size={18} /></button>
      </div>

      <div className="field">
        Designaciones
        <div className="row wrap">
          {DESIG.map((d) => {
            const on = st.designations.includes(d.kind);
            return (
              <button key={d.kind} className={'chip k-' + d.kind} aria-pressed={on} onClick={() => updateSettings({ designations: on ? st.designations.filter((x) => x !== d.kind) : [...st.designations, d.kind] })}>{d.label}</button>
            );
          })}
        </div>
      </div>

      <section className="card">
        <div className="row-between">
          <div>
            <div className="h3" style={{ fontSize: 17 }}>Carga semanal</div>
            <div className="xs muted">{shortDate(ws)} – {shortDate(addDays(ws, 6))}</div>
          </div>
          <div className="row">
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Semana anterior"><Icon.Left size={16} /></button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, minWidth: 64, textAlign: 'center' }}>{hoursLabel(total)}</span>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Semana siguiente"><Icon.Right size={16} /></button>
          </div>
        </div>
        {KIND_ORDER.filter((k) => mins[k] > 0).map((k) => (
          <div key={k} className={'row k-' + k} style={{ gap: 10 }}>
            <span className="small" style={{ width: 84, flex: 'none', fontWeight: 500 }}>{KIND_LABEL[k]}</span>
            <div className="progress" style={{ height: 10 }}><span style={{ width: (mins[k] / max) * 100 + '%' }} /></div>
            <span className="mono" style={{ width: 44, textAlign: 'right' }}>{hoursLabel(mins[k])}</span>
          </div>
        ))}
        {total === 0 && <div className="small muted">Sin actividades esta semana.</div>}
        <button className="btn btn-ghost btn-sm" onClick={report}><Icon.Download size={16} /> Exportar reporte semanal</button>
      </section>

      <div className="list">
        <button className="li" onClick={() => nav.push({ name: 'materias' })}>
          <span><span className="li-title" style={{ display: 'block' }}>Mi horario de clases</span><span className="li-sub">{s.courses.length ? s.courses.map(courseName).join(', ') : 'Sin materias'}</span></span>
          <Icon.Chevron size={18} />
        </button>
        <button className="li" onClick={() => nav.push({ name: 'tareas' })}>
          <span><span className="li-title" style={{ display: 'block' }}>Tareas</span><span className="li-sub">{s.tasks.filter((t) => !t.done).length} pendientes</span></span>
          <Icon.Chevron size={18} />
        </button>
        <button className="li" onClick={() => nav.push({ name: 'calendario-espoch' })}>
          <span><span className="li-title" style={{ display: 'block' }}>Calendario ESPOCH</span><span className="li-sub">{s.calendar ? s.calendar.periodo + (st.espochSyncedAt ? ' · sincronizado ' + shortDate(st.espochSyncedAt.slice(0, 10)) : '') : 'No conectado'}</span></span>
          {s.calendar ? <span className="badge badge-ok">Conectado</span> : <Icon.Chevron size={18} />}
        </button>
      </div>

      <div className="eyebrow">Preferencias</div>
      <div className="list">
        <div className="li">
          <span className="li-title">Tema</span>
          <div className="seg" style={{ width: 210 }}>
            {(['sistema', 'claro', 'oscuro'] as const).map((t) => <button key={t} aria-pressed={st.theme === t} onClick={() => updateSettings({ theme: t })}>{capitalize(t)}</button>)}
          </div>
        </div>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>No molestar</span><span className="li-sub">Silencia los avisos del sistema</span></span>
          <Switch checked={st.dnd} onChange={(v) => updateSettings({ dnd: v })} label="No molestar" />
        </div>
        <div className="li">
          <span className="li-title">Horario de silencio</span>
          <span className="row">
            <input className="input" style={{ width: 104, minHeight: 40 }} type="time" value={st.quietFrom} onChange={(e) => updateSettings({ quietFrom: e.target.value })} aria-label="Silencio desde" />
            <input className="input" style={{ width: 104, minHeight: 40 }} type="time" value={st.quietTo} onChange={(e) => updateSettings({ quietTo: e.target.value })} aria-label="Silencio hasta" />
          </span>
        </div>
        <div className="li" style={{ flexWrap: 'wrap' }}>
          <span className="li-title">Avisos de vencimiento</span>
          <span className="row">
            {reminders.map((r) => {
              const on = st.reminders.includes(r.h);
              return <button key={r.h} className="chip" style={{ minHeight: 36, padding: '0 12px' }} aria-pressed={on} onClick={() => updateSettings({ reminders: on ? st.reminders.filter((x) => x !== r.h) : [...st.reminders, r.h] })}>{r.label}</button>;
            })}
          </span>
        </div>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Jornada</span><span className="li-sub">Para proponer horarios y huecos libres</span></span>
          <span className="row">
            <input className="input" style={{ width: 104, minHeight: 40 }} type="time" value={st.dayStart} onChange={(e) => e.target.value && toMin(e.target.value) < toMin(st.dayEnd) && updateSettings({ dayStart: e.target.value })} aria-label="Inicio de jornada" />
            <input className="input" style={{ width: 104, minHeight: 40 }} type="time" value={st.dayEnd} onChange={(e) => e.target.value && toMin(e.target.value) > toMin(st.dayStart) && updateSettings({ dayEnd: e.target.value })} aria-label="Fin de jornada" />
          </span>
        </div>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Hora preferida para calificar</span><span className="li-sub">El asistente la aprende cuando agendas calificación</span></span>
          <input className="input" style={{ width: 104, minHeight: 40 }} type="time" value={st.preferredGradingHour} onChange={(e) => e.target.value && updateSettings({ preferredGradingHour: e.target.value })} aria-label="Hora preferida para calificar" />
        </div>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Notificaciones del sistema</span><span className="li-sub">{notifPerm === 'granted' ? 'Activadas' : notifPerm === 'denied' ? 'Bloqueadas en el navegador' : notifPerm === 'unsupported' ? 'En iPhone, primero añade la app a la pantalla de inicio' : 'Desactivadas'}</span></span>
          {notifPerm === 'default' && <button className="btn btn-sm" onClick={() => Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Avisos activados' : 'Avisos no activados'))}>Activar</button>}
        </div>
      </div>

      <div className="eyebrow">Sincronización y datos</div>
      <div className="list">
        <button className="li" onClick={() => shareFile('docentime.ics', exportICS(getState()), 'text/calendar').then((r) => toast(r === 'descargado' ? 'Archivo .ics descargado' : 'Listo para compartir'))}>
          <span><span className="li-title" style={{ display: 'block' }}>Exportar a Google Calendar u Outlook</span><span className="li-sub">Archivo .ics con tu semestre</span></span>
          <Icon.Download size={18} />
        </button>
        <button className="li" onClick={() => icsRef.current?.click()}>
          <span><span className="li-title" style={{ display: 'block' }}>Importar calendario .ics</span><span className="li-sub">Agrega eventos de otro calendario</span></span>
          <Icon.Upload size={18} />
        </button>
        <button className="li" onClick={() => shareFile('docentime-respaldo-' + todayISO() + '.json', exportBackup(), 'application/json').then(() => toast('Copia de seguridad lista'))}>
          <span><span className="li-title" style={{ display: 'block' }}>Copia de seguridad</span><span className="li-sub">Guarda todos tus datos en un archivo</span></span>
          <Icon.Download size={18} />
        </button>
        <button className="li" onClick={() => backupRef.current?.click()}>
          <span><span className="li-title" style={{ display: 'block' }}>Restaurar copia</span><span className="li-sub">Útil para pasar tus datos a otro dispositivo</span></span>
          <Icon.Upload size={18} />
        </button>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Modo sin conexión</span><span className="li-sub">Todo se guarda en este dispositivo y funciona sin internet</span></span>
          <span className={'badge ' + (navigator.onLine ? 'badge-ok' : '')}>{navigator.onLine ? 'En línea' : 'Sin conexión'}</span>
        </div>
      </div>
      <input ref={icsRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => e.target.files?.[0] && importIcs(e.target.files[0])} />
      <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />

      {confirm ? (
        <div className="alert-card">
          <div className="small" style={{ fontWeight: 600 }}>{confirm === 'borrar' ? '¿Borrar todos tus datos de este dispositivo? No se puede deshacer.' : '¿Reemplazar tus datos por los de ejemplo?'}</div>
          <div className="row">
            <button
              className="btn btn-sm grow"
              onClick={async () => {
                if (confirm === 'borrar') {
                  resetAll();
                  toast('Datos borrados');
                } else {
                  if (!getState().calendar) await syncEspoch();
                  const cur = getState();
                  replaceState({ ...demoState(cur), settings: { ...demoState(cur).settings, onboarded: true } });
                  toast('Datos de ejemplo cargados');
                }
                setConfirm(null);
              }}
            >
              {confirm === 'borrar' ? 'Borrar todo' : 'Cargar ejemplo'}
            </button>
            <button className="btn btn-ghost btn-sm grow" onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn btn-ghost btn-sm grow" onClick={() => setConfirm('demo')}>Datos de ejemplo</button>
          <button className="btn btn-danger btn-sm grow" onClick={() => setConfirm('borrar')}>Borrar mis datos</button>
        </div>
      )}
      <div className="xs muted center">DocenTime 0.1 · asistente en modo demo · {st.email}</div>
      {editProfile && <ProfileSheet onClose={() => setEditProfile(false)} />}
      <div style={{ height: 20 }} />
    </div>
  );
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const st = getState().settings;
  const [name, setName] = useState(st.name);
  const [faculty, setFaculty] = useState(st.faculty || 'Informática y Electrónica');
  const [career, setCareer] = useState(st.career);
  const [email, setEmail] = useState(st.email);
  return (
    <Sheet title="Editar perfil" onClose={() => close()} closing={closing}>
      <label className="field">Nombre<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">Correo<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Facultad<select className="input" value={faculty} onChange={(e) => setFaculty(e.target.value)}>{Object.keys(FACULTIES).map((f) => <option key={f}>{f}</option>)}</select></label>
      <label className="field">Carrera<input className="input" list="carreras-p" value={career} onChange={(e) => setCareer(e.target.value)} /><datalist id="carreras-p">{(FACULTIES[faculty] ?? []).map((c) => <option key={c} value={c} />)}</datalist></label>
      <button className="btn" onClick={() => { if (!name.trim()) return toast('Escribe tu nombre'); updateSettings({ name: name.trim(), faculty, career, email: email.trim() }); close(() => toast('Perfil actualizado')); }}>Guardar</button>
    </Sheet>
  );
}

export function CoursesScreen() {
  const s = useAppState();
  const nav = useNav();
  const days = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return (
    <div className="screen">
      <BackHeader title="Horario de clases" eyebrow={s.calendar ? s.calendar.periodo : 'Semestre'} onBack={nav.back} />
      {s.courses.length === 0 ? (
        <Empty title="Aún no registras materias" body="Agrega tus materias con sus días y horas; el calendario se llena solo." />
      ) : (
        s.courses.map((c) => (
          <button key={c.id} className="card k-clase" style={{ textAlign: 'left' }} onClick={() => nav.sheet({ type: 'materia', course: c })}>
            <div className="row-between"><span className="h3">{courseName(c)}</span><Icon.Edit size={16} /></div>
            <div className="small muted">{c.room ? 'Aula ' + c.room + ' · ' : ''}{c.slots.map((sl) => days[sl.weekday] + ' ' + sl.start + '–' + sl.end).join(' · ')}</div>
            <div className="row wrap">
              {c.prepBlocks && <span className="badge">Preparación automática</span>}
              {c.gradingBlocks && <span className="badge">Calificación automática</span>}
            </div>
          </button>
        ))
      )}
      <button className="btn" onClick={() => nav.sheet({ type: 'materia' })}><Icon.Plus size={18} /> Agregar materia</button>
      <div className="why">Las sesiones se repiten cada semana entre el inicio y el fin del semestre, y se omiten en feriados. Para cambiar una sola fecha, ábrela desde el calendario.</div>
    </div>
  );
}

export function EspochScreen() {
  const s = useAppState();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    const r = await syncEspoch();
    setBusy(false);
    if (!r.ok) toast('No se pudo sincronizar: ' + (r.error ?? 'sin conexión'));
    else toast(r.changes.length ? r.changes.length + ' cambios detectados' : 'El calendario está al día');
  };
  const cal = s.calendar;
  const label: Record<string, string> = { inicio: 'Inicio', fin: 'Fin', parcial: 'Parcial', examen: 'Evaluaciones', feriado: 'Feriado', notas: 'Notas', otro: 'Otro' };
  return (
    <div className="screen">
      <BackHeader title="Calendario ESPOCH" eyebrow={cal ? cal.periodo : 'No conectado'} onBack={nav.back} />
      {cal?.esEjemplo && <div className="warn">Estas fechas son de ejemplo. Se reemplazarán cuando se publique el calendario académico oficial vigente en la app.</div>}
      <div className="row">
        <button className="btn grow" onClick={sync} disabled={busy}><Icon.Refresh size={18} /> {busy ? 'Sincronizando…' : cal ? 'Sincronizar ahora' : 'Conectar'}</button>
      </div>
      {s.settings.espochSyncedAt && <div className="xs muted">Última sincronización: {longDate(s.settings.espochSyncedAt.slice(0, 10))} · {s.settings.espochSyncedAt.slice(11, 16)} UTC</div>}
      {cal && (
        <div className="list">
          {cal.fechas.map((f) => (
            <div key={f.id} className="li" style={f.type === 'notas' ? { background: 'var(--red-t)' } : undefined}>
              <span>
                <span className="li-title" style={{ display: 'block', color: f.type === 'notas' ? 'var(--red-fg)' : undefined }}>{f.title}</span>
                <span className="li-sub">{capitalize(longDate(f.date))}{f.endDate ? ' – ' + longDate(f.endDate) : ''}</span>
              </span>
              <span className={'badge' + (f.type === 'notas' ? ' badge-red' : '')}>{label[f.type]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="why">Las fechas se publican en un archivo del repositorio (espoch-calendario.json) que se revisa a mano antes de cada actualización. DocenTime lo descarga una vez al día y te avisa si algo cambia.</div>
    </div>
  );
}
