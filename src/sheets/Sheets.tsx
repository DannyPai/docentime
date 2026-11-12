// Hojas emergentes: ver/editar actividad, crear actividad, registro rápido, tareas y materias.
import { useMemo, useState } from 'react';
import type { Activity, ClassSlot, Course, Kind, Occ, Subtask, Task } from '../lib/types';
import { addActivity, getState, opsForDelete, opsForEdit, removeCourse, removeTask, runOps, saveCourse, saveTask, toast, toastUndo, useAppState } from '../lib/store';
import { capitalize, DAYS_LONG, fromMin, longDate, nowTime, todayISO, toMin, uid } from '../lib/dates';
import { conflicts, findSlot, KIND_LABEL, KIND_ORDER } from '../lib/schedule';
import { KindBadge, Sheet, Switch, useClosable } from '../ui/kit';
import type { SheetState } from '../ui/nav';
import * as Icon from '../ui/icons';

export function SheetHost({ sheet, onClose }: { sheet: SheetState; onClose: () => void }) {
  switch (sheet.type) {
    case 'evento': return <EventSheet occ={sheet.occ} onClose={onClose} />;
    case 'nuevo-evento': return <NewEventSheet date={sheet.date} start={sheet.start} onClose={onClose} />;
    case 'rapido': return <QuickSheet onClose={onClose} />;
    case 'tarea': return <TaskSheet task={sheet.task} onClose={onClose} />;
    case 'materia': return <CourseSheet course={sheet.course} onClose={onClose} />;
  }
}

interface FormValue {
  title: string;
  kind: Kind;
  date: string;
  start: string;
  end: string;
  location: string;
  notes: string;
}

function EventForm({ value, onChange, ignoreKey }: { value: FormValue; onChange: (v: FormValue) => void; ignoreKey?: string }) {
  const s = useAppState();
  const set = (p: Partial<FormValue>) => onChange({ ...value, ...p });
  const clash = useMemo(
    () => (value.date && value.start && value.end && toMin(value.end) > toMin(value.start) ? conflicts(s, value.date, value.start, value.end, ignoreKey ? [ignoreKey] : []) : []),
    [s, value.date, value.start, value.end, ignoreKey]
  );
  const invalid = value.start && value.end && toMin(value.end) <= toMin(value.start);
  return (
    <div className="stack-lg">
      <label className="field">
        Título
        <input className="input" value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="Reunión con el decano" autoFocus />
      </label>
      <div className="field">
        Tipo
        <div className="scroll-x">
          {KIND_ORDER.map((k) => (
            <button key={k} type="button" className={'chip k-' + k} aria-pressed={value.kind === k} onClick={() => set({ kind: k })}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Fecha
        <input className="input" type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
      <div className="field-row">
        <label className="field">
          Inicio
          <input
            className="input"
            type="time"
            value={value.start}
            onChange={(e) => {
              const dur = toMin(value.end) - toMin(value.start);
              set({ start: e.target.value, end: e.target.value ? fromMin(toMin(e.target.value) + (dur > 0 ? dur : 60)) : value.end });
            }}
          />
        </label>
        <label className="field">
          Fin
          <input className="input" type="time" value={value.end} onChange={(e) => set({ end: e.target.value })} />
        </label>
      </div>
      {invalid && <div className="error">La hora de fin debe ser posterior al inicio.</div>}
      {!invalid && clash.length > 0 && <div className="warn">Se cruza con {clash.map((c) => c.title + ' (' + c.start + ')').join(', ')}.</div>}
      <label className="field">
        Lugar
        <input className="input" value={value.location} onChange={(e) => set({ location: e.target.value })} placeholder="Sala de docentes" />
      </label>
      <label className="field">
        Notas
        <textarea className="input" value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </div>
  );
}

function valid(v: FormValue): string | null {
  if (!v.title.trim()) return 'Escribe un título.';
  if (!v.date) return 'Elige una fecha.';
  if (!v.start || !v.end) return 'Indica la hora de inicio y fin.';
  if (toMin(v.end) <= toMin(v.start)) return 'La hora de fin debe ser posterior al inicio.';
  return null;
}

function EventSheet({ occ, onClose }: { occ: Occ; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const s = useAppState();
  const activity = occ.activityId ? s.activities.find((a) => a.id === occ.activityId) : undefined;
  const [mode, setMode] = useState<'ver' | 'editar' | 'borrar'>('ver');
  const [form, setForm] = useState<FormValue>({ title: occ.title, kind: occ.kind, date: occ.date, start: occ.start, end: occ.end, location: occ.location ?? '', notes: activity?.notes ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const project = occ.projectId ? s.projects.find((p) => p.id === occ.projectId) : undefined;

  const save = () => {
    const e = valid(form);
    if (e) return setErr(e);
    const patch: Partial<Activity> = { title: form.title.trim(), kind: form.kind, date: form.date, start: form.start, end: form.end, location: form.location || undefined, notes: form.notes || undefined };
    runOps(opsForEdit(occ, patch));
    close(() => toastUndo('Cambios guardados'));
  };
  const del = () => {
    runOps(opsForDelete(occ));
    close(() => toastUndo(occ.source === 'clase' ? 'Sesión eliminada de esta fecha' : 'Actividad eliminada'));
  };
  const moveTomorrow = () => {
    const slot = findSlot(getState(), occ.date === todayISO() ? todayISO() : occ.date, toMin(occ.end) - toMin(occ.start), { ignore: [occ.key], notBefore: occ.end, days: 7 });
    if (!slot) return toast('No encontré un hueco libre en los próximos días');
    runOps(opsForEdit(occ, slot));
    close(() => toastUndo('Movida al ' + longDate(slot.date) + ' · ' + slot.start));
  };

  return (
    <Sheet title={mode === 'editar' ? 'Editar actividad' : undefined} onClose={() => close()} closing={closing}>
      {mode === 'editar' ? (
        <>
          <EventForm value={form} onChange={(v) => { setForm(v); setErr(null); }} ignoreKey={occ.key} />
          {occ.source !== 'actividad' && <div className="why">Es {occ.source === 'clase' ? 'una sesión de tu horario' : 'un bloque automático'}: el cambio solo aplica a esta fecha.</div>}
          {err && <div className="error">{err}</div>}
          <div className="row">
            <button className="btn grow" onClick={save}>Guardar</button>
            <button className="btn btn-ghost grow" onClick={() => setMode('ver')}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <div className="row-between">
            <KindBadge kind={occ.kind} label={occ.source === 'bloque' ? 'Bloque automático' : undefined} />
            <button className="icon-btn" onClick={() => close()} aria-label="Cerrar"><Icon.X size={18} /></button>
          </div>
          <h2 className="h1" style={{ fontSize: 24, margin: 0 }}>{occ.title}</h2>
          <div className="stack">
            <div className="row small"><Icon.Clock size={18} /> {capitalize(longDate(occ.date))} · {occ.start} – {occ.end}</div>
            {occ.location && <div className="row small"><Icon.Pin size={18} /> {occ.location}</div>}
            {project && <div className="row small"><Icon.Folder size={18} /> {project.name}</div>}
            {activity?.notes && <div className="card-flat small" style={{ whiteSpace: 'pre-line' }}>{activity.notes}</div>}
            {occ.source === 'clase' && <div className="why">Sesión generada a partir de tu horario de clases.</div>}
          </div>
          {mode === 'borrar' ? (
            <div className="alert-card">
              <div className="small" style={{ fontWeight: 600 }}>¿Eliminar {occ.source === 'clase' ? 'esta sesión' : 'esta actividad'}?</div>
              <div className="row">
                <button className="btn btn-sm grow" onClick={del}>Eliminar</button>
                <button className="btn btn-ghost btn-sm grow" onClick={() => setMode('ver')}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="row">
                <button className="btn grow" onClick={() => setMode('editar')}><Icon.Edit size={18} /> Editar</button>
                <button className="btn btn-ghost grow" onClick={moveTomorrow}>Mover al siguiente hueco</button>
              </div>
              <button className="btn btn-danger" onClick={() => setMode('borrar')}><Icon.Trash size={18} /> Eliminar</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function NewEventSheet({ date, start, onClose }: { date?: string; start?: string; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const d = date ?? todayISO();
  const slot = start ? { start, end: fromMin(toMin(start) + 60) } : findSlot(getState(), d, 60, { days: 1, notBefore: d === todayISO() ? nowTime() : undefined }) ?? { start: '10:00', end: '11:00' };
  const [form, setForm] = useState<FormValue>({ title: '', kind: 'personal', date: d, start: slot.start, end: slot.end, location: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const e = valid(form);
    if (e) return setErr(e);
    addActivity({ title: form.title.trim(), kind: form.kind, date: form.date, start: form.start, end: form.end, location: form.location || undefined, notes: form.notes || undefined, source: 'manual' });
    close(() => toastUndo('Actividad agregada · ' + longDate(form.date)));
  };
  return (
    <Sheet title="Nueva actividad" onClose={() => close()} closing={closing}>
      <EventForm value={form} onChange={(v) => { setForm(v); setErr(null); }} />
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Agregar</button>
    </Sheet>
  );
}

function QuickSheet({ onClose }: { onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const [type, setType] = useState<'Reunión' | 'Evento' | 'Tarea' | 'Aviso'>('Reunión');
  const [title, setTitle] = useState('');
  const today = todayISO();
  const suggested = useMemo(() => findSlot(getState(), today, 60, { days: 7, notBefore: nowTime() }), [today]);
  const [date, setDate] = useState(suggested?.date ?? today);
  const [start, setStart] = useState(suggested?.start ?? '10:00');
  const [err, setErr] = useState<string | null>(null);
  const isTask = type === 'Tarea' || type === 'Aviso';

  const add = () => {
    const t = title.trim() || (type === 'Reunión' ? 'Reunión imprevista' : type === 'Evento' ? 'Evento imprevisto' : '');
    if (isTask && !t) return setErr('Escribe qué debes recordar.');
    if (isTask) {
      saveTask({ title: t, due: date, priority: type === 'Aviso' ? 'alta' : 'media', kind: 'personal' });
      close(() => toastUndo(type === 'Aviso' ? 'Aviso creado' : 'Tarea agregada'));
    } else {
      addActivity({ title: t, kind: 'personal', date, start, end: fromMin(toMin(start) + 60), source: 'rapido' });
      close(() => toastUndo('Agregado · ' + longDate(date) + ' ' + start));
    }
  };

  const clash = !isTask ? conflicts(getState(), date, start, fromMin(toMin(start) + 60)) : [];
  return (
    <Sheet title="Registro rápido" onClose={() => close()} closing={closing}>
      <div className="seg" role="group" aria-label="Tipo">
        {(['Reunión', 'Evento', 'Tarea', 'Aviso'] as const).map((t) => (
          <button key={t} aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      <label className="field">
        {isTask ? 'Qué debes hacer' : 'Título'}
        <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder={isTask ? 'Enviar acta de la comisión' : 'Reunión urgente con el decano'} autoFocus onKeyDown={(e) => e.key === 'Enter' && add()} />
      </label>
      <div className="field-row">
        <label className="field">
          {isTask ? 'Para el' : 'Fecha'}
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!isTask && (
          <label className="field">
            Hora
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        )}
      </div>
      {!isTask && (clash.length ? <div className="warn">Se cruza con {clash.map((c) => c.title).join(', ')}.</div> : suggested && date === suggested.date && start === suggested.start ? <div className="small muted">Primer hueco libre sin cruces, de 1 hora.</div> : null)}
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={add}>{isTask ? 'Agregar a mis tareas' : 'Agregar a mi calendario'}</button>
    </Sheet>
  );
}

function TaskSheet({ task, onClose }: { task?: Task; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const s = useAppState();
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.due ?? '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'media');
  const [kind, setKind] = useState<Kind>(task?.kind ?? 'personal');
  const [projectId, setProjectId] = useState(task?.projectId ?? '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [newSub, setNewSub] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (!title.trim()) return setErr('Escribe un título.');
    saveTask({ id: task?.id, title: title.trim(), due: due || undefined, priority, kind, subtasks, projectId: projectId || undefined });
    close(() => toast(task ? 'Tarea actualizada' : 'Tarea agregada'));
  };
  const addSub = () => {
    if (!newSub.trim()) return;
    setSubtasks([...subtasks, { id: uid('s'), title: newSub.trim(), done: false }]);
    setNewSub('');
  };
  return (
    <Sheet title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={() => close()} closing={closing}>
      <label className="field">
        Título
        <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder="Calificar exámenes del parcial" autoFocus />
      </label>
      <div className="field-row">
        <label className="field">
          Vence
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="field">
          Prioridad
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>
      </div>
      <div className="field">
        Tipo
        <div className="scroll-x">
          {KIND_ORDER.map((k) => (
            <button key={k} className={'chip k-' + k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
      </div>
      {s.projects.length > 0 && (
        <label className="field">
          Proyecto o comisión
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Ninguno</option>
            {s.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <div className="field">
        Subtareas
        <div className="stack">
          {subtasks.map((st) => (
            <div key={st.id} className="row">
              <button className="check" role="checkbox" aria-checked={st.done} aria-label={st.title} onClick={() => setSubtasks(subtasks.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)))}>
                {st.done && <Icon.Check size={14} />}
              </button>
              <span className="grow small" style={{ color: 'var(--fg)', fontWeight: 400 }}>{st.title}</span>
              <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={'Quitar ' + st.title} onClick={() => setSubtasks(subtasks.filter((x) => x.id !== st.id))}><Icon.X size={14} /></button>
            </div>
          ))}
          <div className="row">
            <input className="input grow" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Agregar subtarea" onKeyDown={(e) => e.key === 'Enter' && addSub()} aria-label="Nueva subtarea" />
            <button className="icon-btn" onClick={addSub} aria-label="Agregar subtarea"><Icon.Plus size={18} /></button>
          </div>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Guardar</button>
      {task && <button className="btn btn-danger" onClick={() => { removeTask(task.id); close(() => toastUndo('Tarea eliminada')); }}><Icon.Trash size={18} /> Eliminar tarea</button>}
    </Sheet>
  );
}

function CourseSheet({ course, onClose }: { course?: Course; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const [subject, setSubject] = useState(course?.subject ?? '');
  const [parallel, setParallel] = useState(course?.parallel ?? '');
  const [room, setRoom] = useState(course?.room ?? '');
  const [slots, setSlots] = useState<ClassSlot[]>(course?.slots ?? [{ weekday: 1, start: '07:00', end: '09:00' }]);
  const [prep, setPrep] = useState(course?.prepBlocks ?? true);
  const [grading, setGrading] = useState(course?.gradingBlocks ?? true);
  const [err, setErr] = useState<string | null>(null);
  const setSlot = (i: number, p: Partial<ClassSlot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const save = () => {
    if (!subject.trim()) return setErr('Escribe el nombre de la materia.');
    if (!slots.length) return setErr('Agrega al menos un horario.');
    if (slots.some((s) => toMin(s.end) <= toMin(s.start))) return setErr('Revisa los horarios: el fin debe ser posterior al inicio.');
    saveCourse({ id: course?.id ?? uid('c'), subject: subject.trim(), parallel: parallel.trim(), room: room.trim(), slots, prepBlocks: prep, gradingBlocks: grading });
    close(() => toast(course ? 'Materia actualizada' : 'Materia agregada a tu horario'));
  };
  return (
    <Sheet title={course ? 'Editar materia' : 'Nueva materia'} onClose={() => close()} closing={closing}>
      <label className="field">
        Materia
        <input className="input" value={subject} onChange={(e) => { setSubject(e.target.value); setErr(null); }} placeholder="Bases de Datos" autoFocus />
      </label>
      <div className="field-row">
        <label className="field">
          Paralelo
          <input className="input" value={parallel} onChange={(e) => setParallel(e.target.value)} placeholder="A" />
        </label>
        <label className="field">
          Aula
          <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="FIE-204" />
        </label>
      </div>
      <div className="field">
        Días y horas
        <div className="stack">
          {slots.map((sl, i) => (
            <div key={i} className="row">
              <div className="field-row-3 grow">
                <select className="input" value={sl.weekday} onChange={(e) => setSlot(i, { weekday: Number(e.target.value) })} aria-label="Día">
                  {DAYS_LONG.slice(0, 6).map((d, j) => <option key={d} value={j + 1}>{capitalize(d)}</option>)}
                </select>
                <input className="input" type="time" value={sl.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label="Inicio" />
                <input className="input" type="time" value={sl.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label="Fin" />
              </div>
              <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label="Quitar horario"><Icon.X size={14} /></button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setSlots([...slots, { weekday: Math.min(6, (slots[slots.length - 1]?.weekday ?? 0) + 1), start: '07:00', end: '09:00' }])}><Icon.Plus size={16} /> Agregar horario</button>
        </div>
      </div>
      <div className="list">
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Bloque de preparación</span><span className="li-sub">1 h por semana, antes de la primera clase</span></span>
          <Switch checked={prep} onChange={setPrep} label="Bloque de preparación" />
        </div>
        <div className="li">
          <span><span className="li-title" style={{ display: 'block' }}>Bloque de calificación</span><span className="li-sub">1 h por semana, después de la última clase</span></span>
          <Switch checked={grading} onChange={setGrading} label="Bloque de calificación" />
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Guardar materia</button>
      {course && <button className="btn btn-danger" onClick={() => { removeCourse(course.id); close(() => toastUndo('Materia eliminada del horario')); }}><Icon.Trash size={18} /> Eliminar materia</button>}
    </Sheet>
  );
}
