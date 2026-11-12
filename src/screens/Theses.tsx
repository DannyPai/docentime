import { useState } from 'react';
import type { Thesis } from '../lib/types';
import { addActivity, removeThesis, saveThesis, toast, toastUndo, useAppState } from '../lib/store';
import { capitalize, fromMin, longDate, relativeDate, shortDate, todayISO, toMin, uid } from '../lib/dates';
import { conflicts } from '../lib/schedule';
import { getState } from '../lib/store';
import { BackHeader, CheckButton, Empty, initials, Sheet, useClosable } from '../ui/kit';
import { useNav } from '../ui/nav';
import * as Icon from '../ui/icons';

const STAGES = ['Anteproyecto', 'Desarrollo', 'Revisión final', 'Defensa'];

export default function Theses() {
  const s = useAppState();
  const nav = useNav();
  const [edit, setEdit] = useState<Thesis | 'nuevo' | null>(null);
  const today = todayISO();
  const tutor = s.theses.filter((t) => t.role === 'tutor');
  const tribunal = s.theses.filter((t) => t.role === 'tribunal');

  const schedule = (t: Thesis) => {
    if (!t.nextMeeting) return setEdit(t);
    const date = t.nextMeeting.slice(0, 10);
    const start = t.nextMeeting.slice(11, 16);
    const end = fromMin(toMin(start) + 60);
    const exists = s.activities.some((a) => a.date === date && a.start === start && a.title.includes(t.student));
    if (exists) return toast('Ya está en tu calendario');
    const clash = conflicts(getState(), date, start, end);
    addActivity({ title: (t.role === 'tribunal' ? 'Defensa · ' : 'Revisión de tesis · ') + t.student, kind: 'titulacion', date, start, end, source: 'manual' });
    toastUndo('Agendado el ' + longDate(date) + (clash.length ? ' · ojo: se cruza con ' + clash[0].title : ''));
  };

  const card = (t: Thesis) => {
    const done = t.checklist.filter((c) => c.done).length;
    return (
      <section key={t.id} className="card k-titulacion">
        <div className="row">
          <span className="avatar" style={{ width: 40, height: 40, background: 'var(--kt)', color: 'var(--kc)' }}>{initials(t.student)}</span>
          <div className="grow">
            <div className="h3">{t.student}</div>
            <div className="xs muted">{t.topic}</div>
          </div>
          <span className="badge">{STAGES[t.stage]}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
          {STAGES.map((st, i) => (
            <button key={st} onClick={() => saveThesis({ ...t, stage: i })} aria-label={'Etapa ' + st} style={{ border: 'none', background: 'none', padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
              <span style={{ height: 6, borderRadius: 9999, background: i <= t.stage ? 'var(--kc)' : 'var(--band)', transition: 'background-color .3s' }} />
              <span style={{ fontSize: 10, color: i === t.stage ? 'var(--fg)' : 'var(--fg2)', fontWeight: i === t.stage ? 700 : 400 }}>{st}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <div className="card-flat grow" style={{ padding: '8px 12px' }}><div className="xs muted">Última revisión</div><div className="small" style={{ fontWeight: 600 }}>{t.lastReview ? shortDate(t.lastReview) : '—'}</div></div>
          <div className="card-flat grow" style={{ padding: '8px 12px' }}><div className="xs muted">{t.role === 'tribunal' ? 'Defensa' : 'Próxima cita'}</div><div className="small" style={{ fontWeight: 600 }}>{t.nextMeeting ? capitalize(relativeDate(t.nextMeeting.slice(0, 10), today)) + ' · ' + t.nextMeeting.slice(11, 16) : 'Sin agendar'}</div></div>
        </div>
        {t.checklist.length > 0 && (
          <div className="stack">
            <div className="row"><div className="progress"><span style={{ width: (done / t.checklist.length) * 100 + '%' }} /></div><span className="mono">{done}/{t.checklist.length}</span></div>
            {t.checklist.map((c) => (
              <div key={c.id} className="row">
                <CheckButton checked={c.done} label={c.title} onChange={() => saveThesis({ ...t, checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                <span className="small grow" style={{ textDecoration: c.done ? 'line-through' : undefined, color: c.done ? 'var(--fg3)' : undefined }}>{c.title}</span>
              </div>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button className="btn btn-sm grow" onClick={() => schedule(t)}>Agendar en calendario</button>
          {t.role === 'tutor' && <button className="btn btn-ghost btn-sm grow" onClick={() => { saveThesis({ ...t, lastReview: today }); toast('Revisión registrada hoy'); }}>Registrar revisión</button>}
          <button className="icon-btn" onClick={() => setEdit(t)} aria-label={'Editar ' + t.student}><Icon.Edit size={16} /></button>
        </div>
      </section>
    );
  };

  return (
    <div className="screen">
      <BackHeader title="Tesistas" eyebrow="Comisión de Titulación" onBack={nav.back} right={<button className="icon-btn" onClick={() => setEdit('nuevo')} aria-label="Agregar tesista"><Icon.Plus size={18} /></button>} />
      {s.theses.length === 0 && <Empty title="Sin tesistas registrados" body="Registra a tus tesistas para seguir su etapa, revisiones y próximas citas." action={<button className="btn btn-sm" onClick={() => setEdit('nuevo')}>Agregar tesista</button>} />}
      {tutor.length > 0 && <div className="eyebrow">Tesistas a cargo</div>}
      {tutor.map(card)}
      {tribunal.length > 0 && <div className="eyebrow">Tribunales y defensas asignadas</div>}
      {tribunal.map(card)}
      {edit && <ThesisSheet thesis={edit === 'nuevo' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ThesisSheet({ thesis, onClose }: { thesis?: Thesis; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const [student, setStudent] = useState(thesis?.student ?? '');
  const [topic, setTopic] = useState(thesis?.topic ?? '');
  const [role, setRole] = useState<Thesis['role']>(thesis?.role ?? 'tutor');
  const [stage, setStage] = useState(thesis?.stage ?? 0);
  const [lastReview, setLastReview] = useState(thesis?.lastReview ?? '');
  const [nextDate, setNextDate] = useState(thesis?.nextMeeting?.slice(0, 10) ?? '');
  const [nextTime, setNextTime] = useState(thesis?.nextMeeting?.slice(11, 16) ?? '11:00');
  const [items, setItems] = useState(thesis?.checklist ?? []);
  const [newItem, setNewItem] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const save = () => {
    if (!student.trim()) return toast('Escribe el nombre del estudiante');
    saveThesis({ id: thesis?.id ?? uid('t'), student: student.trim(), topic: topic.trim(), role, stage, lastReview: lastReview || undefined, nextMeeting: nextDate ? nextDate + 'T' + (nextTime || '11:00') : undefined, checklist: items });
    close(() => toast(thesis ? 'Tesista actualizado' : 'Tesista agregado'));
  };
  return (
    <Sheet title={thesis ? 'Editar tesista' : 'Nuevo tesista'} onClose={() => close()} closing={closing}>
      <label className="field">Estudiante<input className="input" value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Pedro Guamán" autoFocus /></label>
      <label className="field">Tema<input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Sistema de trazabilidad…" /></label>
      <div className="seg" role="group" aria-label="Rol">
        <button aria-pressed={role === 'tutor'} onClick={() => setRole('tutor')}>Soy tutor</button>
        <button aria-pressed={role === 'tribunal'} onClick={() => setRole('tribunal')}>Soy tribunal</button>
      </div>
      <label className="field">Etapa<select className="input" value={stage} onChange={(e) => setStage(Number(e.target.value))}>{STAGES.map((st, i) => <option key={st} value={i}>{st}</option>)}</select></label>
      <label className="field">Última revisión<input className="input" type="date" value={lastReview} onChange={(e) => setLastReview(e.target.value)} /></label>
      <div className="field-row">
        <label className="field">{role === 'tribunal' ? 'Defensa' : 'Próxima cita'}<input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></label>
        <label className="field">Hora<input className="input" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} /></label>
      </div>
      <div className="field">
        Observaciones por resolver
        {items.map((c) => (
          <div key={c.id} className="row">
            <span className="small grow" style={{ color: 'var(--fg)', fontWeight: 400 }}>{c.title}</span>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setItems(items.filter((x) => x.id !== c.id))} aria-label={'Quitar ' + c.title}><Icon.X size={14} /></button>
          </div>
        ))}
        <div className="row">
          <input className="input grow" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Corregir marco teórico" aria-label="Nueva observación" onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { setItems([...items, { id: uid('s'), title: newItem.trim(), done: false }]); setNewItem(''); } }} />
          <button className="icon-btn" onClick={() => { if (newItem.trim()) { setItems([...items, { id: uid('s'), title: newItem.trim(), done: false }]); setNewItem(''); } }} aria-label="Agregar observación"><Icon.Plus size={18} /></button>
        </div>
      </div>
      <button className="btn" onClick={save}>Guardar</button>
      {thesis && (confirmDel ? (
        <div className="alert-card">
          <div className="small" style={{ fontWeight: 600 }}>¿Quitar a {thesis.student} del seguimiento?</div>
          <div className="row">
            <button className="btn btn-sm grow" onClick={() => { removeThesis(thesis.id); close(() => toastUndo('Tesista eliminado')); }}>Quitar</button>
            <button className="btn btn-ghost btn-sm grow" onClick={() => setConfirmDel(false)}>Cancelar</button>
          </div>
        </div>
      ) : <button className="btn btn-danger" onClick={() => setConfirmDel(true)}><Icon.Trash size={18} /> Quitar tesista</button>)}
    </Sheet>
  );
}
