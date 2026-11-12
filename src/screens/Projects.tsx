import { useMemo, useState } from 'react';
import type { Project, ProjectType } from '../lib/types';
import { addActivity, addMember, addMilestone, getState, removeProject, respondInvitation, saveProject, toast, toastUndo, toggleMilestone, updateProject, useAppState } from '../lib/store';
import { addDays, capitalize, DAYS_SHORT, fromISO, longDate, relativeDate, shortDate, todayISO, toMin, uid, weekday, fromMin } from '../lib/dates';
import { commonSlots, exportAvailability, isBusy, memberBusy, myBusy, parseAvailability } from '../lib/availability';
import { findSlot, holidaySet, occurrences } from '../lib/schedule';
import { shareFile, singleEventICS } from '../lib/ics';
import { BackHeader, Empty, initials, Sheet, useClosable } from '../ui/kit';
import { useNav } from '../ui/nav';
import * as Icon from '../ui/icons';

export const TYPE_LABEL: Record<ProjectType, string> = { vinculacion: 'Vinculación', investigacion: 'Investigación', comision: 'Comisión', titulacion: 'Titulación', otro: 'Otro' };
const TYPE_KIND: Record<ProjectType, string> = { vinculacion: 'proyecto', investigacion: 'proyecto', comision: 'comision', titulacion: 'titulacion', otro: 'personal' };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function shareText(title: string, text: string) {
  const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
  if (nav.share && /iphone|ipad|android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ title, text });
      return;
    } catch {
      /* cancelado */
    }
  }
  toast((await copyText(text)) ? 'Copiado al portapapeles' : 'No se pudo copiar');
}

export default function Projects() {
  const s = useAppState();
  const nav = useNav();
  const [filter, setFilter] = useState<'todos' | ProjectType>('todos');
  const [form, setForm] = useState(false);
  const types = Array.from(new Set(s.projects.map((p) => p.type)));
  const list = s.projects.filter((p) => filter === 'todos' || p.type === filter);
  const invitations = s.invitations.filter((i) => i.status === 'pendiente' || i.status === 'reprogramada');
  const today = todayISO();

  return (
    <div className="screen">
      <div className="head" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{s.projects.length} {s.projects.length === 1 ? 'designación activa' : 'designaciones activas'}</div>
          <h1 className="h1">Proyectos</h1>
        </div>
        <button className="btn btn-sm" onClick={() => setForm(true)}><Icon.Plus size={16} /> Nuevo</button>
      </div>

      {invitations.map((inv) => {
        const p = s.projects.find((x) => x.id === inv.projectId);
        return (
          <section key={inv.id} className="card k-proyecto">
            <div className="ev-kind">Invitación{p ? ' · ' + TYPE_LABEL[p.type] : ''}</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{inv.title}</div>
            <div className="small muted">{capitalize(longDate(inv.date))} · {inv.start} – {inv.end} · propone {inv.from}</div>
            {inv.status === 'pendiente' ? (
              <div className="row">
                <button className="btn btn-sm grow" onClick={() => { respondInvitation(inv.id, 'aceptada'); toastUndo('Aceptada y agregada a tu calendario'); }}>Aceptar</button>
                <button
                  className="btn btn-ghost btn-sm grow"
                  onClick={() => {
                    const alt = findSlot(getState(), inv.date, toMin(inv.end) - toMin(inv.start), { notBefore: inv.end, days: 7 });
                    if (!alt) return toast('No encontré otro hueco libre esta semana');
                    respondInvitation(inv.id, 'reprogramada', alt);
                    toast('Propuesta lista para enviar');
                  }}
                >
                  Reprogramar
                </button>
                <button className="btn btn-ghost btn-sm grow" onClick={() => { respondInvitation(inv.id, 'rechazada'); toastUndo('Invitación rechazada'); }}>Rechazar</button>
              </div>
            ) : (
              <div className="stack">
                <div className="why">Propusiste {longDate(inv.proposal!.date)} · {inv.proposal!.start}. Envía la propuesta a {inv.from}.</div>
                <button className="btn btn-sm" onClick={() => shareText('Propuesta de horario', 'Hola ' + inv.from + ', para «' + inv.title + '» propongo el ' + longDate(inv.proposal!.date) + ' de ' + inv.proposal!.start + ' a ' + inv.proposal!.end + '. — enviado desde DocenTime')}>Enviar propuesta</button>
              </div>
            )}
          </section>
        );
      })}

      {types.length > 1 && (
        <div className="scroll-x">
          <button className="chip" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>Todos</button>
          {types.map((t) => <button key={t} className="chip" aria-pressed={filter === t} onClick={() => setFilter(t)}>{TYPE_LABEL[t]}</button>)}
        </div>
      )}

      {list.length === 0 ? (
        <Empty title="Aún no tienes proyectos" body="Crea un proyecto o comisión para planificar reuniones sin cruces." action={<button className="btn btn-sm" onClick={() => setForm(true)}>Crear proyecto</button>} />
      ) : (
        list.map((p) => {
          const done = p.milestones.filter((m) => m.done).length;
          const next = p.milestones.find((m) => !m.done);
          const nextMeeting = s.activities.filter((a) => a.projectId === p.id && a.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
          return (
            <button key={p.id} className={'card k-' + TYPE_KIND[p.type]} style={{ textAlign: 'left' }} onClick={() => nav.push({ name: 'proyecto', id: p.id })}>
              <div className="row-between">
                <span className="badge">{TYPE_LABEL[p.type]}</span>
                <span className="xs muted">{p.role}</span>
              </div>
              <div className="h3" style={{ fontSize: 17 }}>{p.name}</div>
              {p.milestones.length > 0 && (
                <div className="row">
                  <div className="progress"><span style={{ width: (done / p.milestones.length) * 100 + '%' }} /></div>
                  <span className="mono">{done} de {p.milestones.length} hitos</span>
                </div>
              )}
              <div className="row-between">
                <span className="small muted grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Próximo: <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{nextMeeting ? nextMeeting.title + ' · ' + relativeDate(nextMeeting.date, today).toLowerCase() : next ? next.title + ' · ' + shortDate(next.date) : 'sin pendientes'}</span>
                </span>
                <span className="avatars">
                  <span className="avatar">{initials(s.settings.name || 'Yo')}</span>
                  {p.members.slice(0, 3).map((m) => <span key={m.id} className="avatar">{initials(m.name)}</span>)}
                </span>
              </div>
            </button>
          );
        })
      )}

      {(s.settings.designations.includes('titulacion') || s.theses.length > 0) && (
        <button className="btn btn-ghost" onClick={() => nav.push({ name: 'tesistas' })}><Icon.Cap size={18} /> Seguimiento de tesistas</button>
      )}
      {form && <ProjectForm onClose={() => setForm(false)} />}
    </div>
  );
}

function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  const [name, setName] = useState(project?.name ?? '');
  const [type, setType] = useState<ProjectType>(project?.type ?? 'vinculacion');
  const [role, setRole] = useState(project?.role ?? 'Miembro');
  const [members, setMembers] = useState(project ? '' : '');
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (!name.trim()) return setErr('Escribe el nombre.');
    const extra = members.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((n) => ({ id: uid('m'), name: n, busy: [] }));
    saveProject({ id: project?.id ?? uid('p'), name: name.trim(), type, role: role.trim() || 'Miembro', members: [...(project?.members ?? []), ...extra], milestones: project?.milestones ?? [] });
    close(() => toast(project ? 'Proyecto actualizado' : 'Proyecto creado'));
  };
  return (
    <Sheet title={project ? 'Editar proyecto' : 'Nuevo proyecto o comisión'} onClose={() => close()} closing={closing}>
      <label className="field">Nombre<input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="Alfabetización digital rural" autoFocus /></label>
      <div className="field">
        Tipo
        <div className="row wrap">
          {(Object.keys(TYPE_LABEL) as ProjectType[]).map((t) => <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}
        </div>
      </div>
      <label className="field">Tu rol<input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Coordinador, miembro, director…" /></label>
      <label className="field">{project ? 'Agregar miembros' : 'Miembros'}<textarea className="input" value={members} onChange={(e) => setMembers(e.target.value)} placeholder="Carlos Vaca, María Tapia" /></label>
      <div className="xs muted">Separa los nombres con comas. Luego cada miembro puede compartirte su código de disponibilidad.</div>
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Guardar</button>
    </Sheet>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const s = useAppState();
  const nav = useNav();
  const p = s.projects.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState(addDays(todayISO(), 14));
  const [importFor, setImportFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [newMember, setNewMember] = useState('');
  const today = todayISO();
  if (!p) return <div className="screen"><BackHeader title="Proyecto" onBack={nav.back} /><Empty title="Este proyecto ya no existe" /></div>;
  const meetings = s.activities.filter((a) => a.projectId === p.id && a.date >= addDays(today, -30)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const tasks = s.tasks.filter((t) => t.projectId === p.id);
  const timeline = [
    ...p.milestones.map((m) => ({ id: m.id, date: m.date, title: m.title, type: 'hito' as const, done: m.done })),
    ...meetings.map((m) => ({ id: m.id, date: m.date, title: m.title + ' · ' + m.start, type: 'reunion' as const, done: m.date < today }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  const doImport = () => {
    const parsed = parseAvailability(code);
    if (!parsed) return toast('El código no es válido');
    updateProject(p.id, (x) => ({ ...x, members: x.members.map((m) => (m.id === importFor ? { ...m, busy: parsed.busy, busyUpdatedAt: new Date().toISOString(), demo: false } : m)) }));
    setImportFor(null);
    setCode('');
    toast('Disponibilidad de ' + parsed.name + ' importada');
  };

  return (
    <div className="screen">
      <BackHeader title={p.name} eyebrow={TYPE_LABEL[p.type] + ' · ' + p.role} onBack={nav.back} right={<button className="icon-btn" onClick={() => setEdit(true)} aria-label="Editar proyecto"><Icon.Edit size={18} /></button>} />
      <div className="row">
        <button className="btn grow" onClick={() => nav.push({ name: 'reunion', projectId: p.id })}><Icon.Users size={18} /> Planificar reunión</button>
      </div>

      <section className="stack">
        <h2 className="h2">Línea de tiempo</h2>
        {timeline.length === 0 && <div className="small muted">Agrega hitos y reuniones para verlos aquí.</div>}
        <div className="stack" style={{ gap: 0 }}>
          {timeline.map((t, i) => (
            <div key={t.id} className="row" style={{ alignItems: 'stretch', gap: 12 }}>
              <div style={{ width: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, marginTop: 14, borderRadius: 9999, background: t.done ? 'var(--green)' : t.type === 'hito' ? 'var(--red)' : 'var(--gold)', flex: 'none' }} />
                {i < timeline.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--ln)' }} />}
              </div>
              <div className="grow row-between" style={{ padding: '8px 0' }}>
                <span>
                  <span style={{ display: 'block', fontWeight: 500, textDecoration: t.done && t.type === 'hito' ? 'line-through' : undefined }}>{t.title}</span>
                  <span className="xs muted">{t.type === 'hito' ? 'Hito' : 'Reunión'} · {shortDate(t.date)}</span>
                </span>
                {t.type === 'hito' && (
                  <button className="check" role="checkbox" aria-checked={t.done} aria-label={'Hito cumplido: ' + t.title} onClick={() => toggleMilestone(p.id, t.id)}>
                    {t.done && <Icon.Check size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="card-flat stack">
          <div className="mono">Nuevo hito o entregable</div>
          <input className="input" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="Informe de avance" aria-label="Título del hito" />
          <div className="row">
            <input className="input grow" type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} aria-label="Fecha del hito" />
            <button className="btn btn-sm" onClick={() => { if (!msTitle.trim()) return toast('Escribe el título del hito'); addMilestone(p.id, { id: uid('h'), title: msTitle.trim(), date: msDate, done: false }); setMsTitle(''); toast('Hito agregado'); }}>Agregar</button>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="row-between">
          <h2 className="h2">Miembros</h2>
          <button className="btn-link" onClick={async () => shareText('Mi disponibilidad · DocenTime', 'Mi disponibilidad de las próximas 4 semanas (solo ocupado/libre). Pégalo en DocenTime › Proyectos › Importar disponibilidad:\n\n' + exportAvailability(getState()))}>Compartir mi disponibilidad</button>
        </div>
        <div className="list">
          <div className="li">
            <span className="row"><span className="avatar">{initials(s.settings.name || 'Yo')}</span><span><span className="li-title" style={{ display: 'block' }}>{s.settings.name || 'Tú'}</span><span className="li-sub">Tú · {p.role}</span></span></span>
          </div>
          {p.members.map((m) => (
            <div key={m.id} className="li">
              <span className="row grow"><span className="avatar">{initials(m.name)}</span>
                <span className="grow">
                  <span className="li-title" style={{ display: 'block' }}>{m.name}</span>
                  <span className="li-sub">{m.demo ? 'Disponibilidad de ejemplo' : m.busyUpdatedAt ? 'Disponibilidad al ' + shortDate(m.busyUpdatedAt.slice(0, 10)) : 'Sin disponibilidad'}</span>
                </span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setImportFor(m.id)}>Importar</button>
            </div>
          ))}
        </div>
        <div className="row">
          <input className="input grow" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nombre del nuevo miembro" aria-label="Nuevo miembro" />
          <button className="icon-btn" onClick={() => { if (!newMember.trim()) return; addMember(p.id, { id: uid('m'), name: newMember.trim(), busy: [] }); setNewMember(''); toast('Miembro agregado'); }} aria-label="Agregar miembro"><Icon.Plus size={18} /></button>
        </div>
        <div className="why">Privacidad: con el código solo se comparte ocupado/libre, nunca el detalle de tus actividades.</div>
      </section>

      {tasks.length > 0 && (
        <section className="stack">
          <h2 className="h2">Tareas del proyecto</h2>
          {tasks.map((t) => (
            <button key={t.id} className="task" style={{ textAlign: 'left' }} onClick={() => nav.sheet({ type: 'tarea', task: t })}>
              <span className="grow"><span className="task-title" style={{ display: 'block', textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</span><span className="xs muted">{t.due ? 'Vence ' + shortDate(t.due) : 'Sin fecha'}{t.subtasks.length ? ' · ' + t.subtasks.filter((x) => x.done).length + '/' + t.subtasks.length : ''}</span></span>
              <Icon.Chevron size={16} />
            </button>
          ))}
        </section>
      )}

      {confirmDel ? (
        <div className="alert-card">
          <div className="small" style={{ fontWeight: 600 }}>¿Eliminar «{p.name}»? Sus reuniones seguirán en tu calendario.</div>
          <div className="row">
            <button className="btn btn-sm grow" onClick={() => { removeProject(p.id); nav.back(); toastUndo('Proyecto eliminado'); }}>Eliminar</button>
            <button className="btn btn-ghost btn-sm grow" onClick={() => setConfirmDel(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-danger" onClick={() => setConfirmDel(true)}><Icon.Trash size={18} /> Eliminar proyecto</button>
      )}

      {edit && <ProjectForm project={p} onClose={() => setEdit(false)} />}
      {importFor && (
        <ImportSheet name={p.members.find((m) => m.id === importFor)?.name ?? ''} code={code} setCode={setCode} onImport={doImport} onClose={() => setImportFor(null)} />
      )}
      <div style={{ height: 40 }} />
    </div>
  );
}

function ImportSheet({ name, code, setCode, onImport, onClose }: { name: string; code: string; setCode: (s: string) => void; onImport: () => void; onClose: () => void }) {
  const { closing, close } = useClosable(onClose);
  return (
    <Sheet title={'Disponibilidad de ' + name} onClose={() => close()} closing={closing}>
      <div className="small muted">Pídele a {name} que abra DocenTime, entre a un proyecto y toque «Compartir mi disponibilidad». Pega aquí el código que te envíe.</div>
      <textarea className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="DT1:…" aria-label="Código de disponibilidad" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
      <button className="btn" onClick={onImport}>Importar</button>
    </Sheet>
  );
}

export function MeetingPlanner({ projectId }: { projectId: string }) {
  const s = useAppState();
  const nav = useNav();
  const p = s.projects.find((x) => x.id === projectId);
  const today = todayISO();
  const [title, setTitle] = useState('Reunión de planificación');
  const [dur, setDur] = useState(60);
  const hol = holidaySet(s);
  const dates = useMemo(() => {
    const out: string[] = [];
    let d = today;
    while (out.length < 10) {
      if (weekday(d) <= 5 && !hol.has(d)) out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [today, hol]);
  const [date, setDate] = useState(dates[0]);
  const [pick, setPick] = useState<number | null>(0);
  const suggestions = useMemo(() => (p ? commonSlots(s, p, today, 14, dur) : []), [s, p, today, dur]);
  if (!p) return <div className="screen"><BackHeader title="Reunión" onBack={nav.back} /></div>;

  const { dayStart, dayEnd } = s.settings;
  const sh = Math.floor(toMin(dayStart) / 60);
  const hours = Array.from({ length: Math.min(12, Math.ceil(toMin(dayEnd) / 60) - sh) }, (_, i) => sh + i);
  const rows = [
    { name: 'Tú', busy: myBusy(s, date, date) as ReturnType<typeof myBusy> | null },
    ...p.members.map((m) => ({ name: m.name.split(' ')[0] + ' ' + (m.name.split(' ')[1]?.[0] ?? '') + '.', busy: memberBusy(m, date, date) }))
  ];
  const chosen = pick !== null ? suggestions[pick] : undefined;

  const schedule = async () => {
    if (!chosen) return toast('Elige un horario');
    if (!title.trim()) return toast('Escribe el título de la reunión');
    const busyNow = occurrences(getState(), chosen.date, chosen.date).some((o) => toMin(o.start) < toMin(chosen.end) && toMin(chosen.start) < toMin(o.end));
    if (busyNow) return toast('Ese horario ya no está libre; elige otro');
    addActivity({ title: title.trim() + ' · ' + p.name, kind: p.type === 'comision' ? 'comision' : p.type === 'titulacion' ? 'titulacion' : 'proyecto', date: chosen.date, start: chosen.start, end: chosen.end, projectId: p.id, source: 'manual' });
    const how = await shareFile('invitacion-' + chosen.date + '.ics', singleEventICS({ title: title.trim() + ' · ' + p.name, date: chosen.date, start: chosen.start, end: chosen.end, description: 'Invitación enviada desde DocenTime por ' + (s.settings.name || 'un docente') }), 'text/calendar');
    toastUndo('Reunión agendada' + (how === 'descargado' ? ' · invitación .ics descargada' : ''));
    nav.back();
  };

  return (
    <div className="screen">
      <BackHeader title="Nueva reunión" eyebrow={p.name} onBack={nav.back} />
      <label className="field">Título<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="field">
        Duración
        <div className="seg" role="group" aria-label="Duración">
          {[30, 60, 90, 120].map((d) => <button key={d} aria-pressed={dur === d} onClick={() => { setDur(d); setPick(0); }}>{d < 60 ? d + ' min' : String(d / 60).replace('.', ',') + ' h'}</button>)}
        </div>
      </div>

      <section className="card">
        <div className="row-between"><span className="h3">Disponibilidad</span><span className="mono">{String(hours[0]).padStart(2, '0')} – {String(hours[hours.length - 1] + 1).padStart(2, '0')} h</span></div>
        <div className="scroll-x">
          {dates.map((d) => (
            <button key={d} className="chip" aria-pressed={d === date} onClick={() => setDate(d)}>{DAYS_SHORT[weekday(d) - 1]} {fromISO(d).getDate()}</button>
          ))}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((r) => (
            <div key={r.name} className="av-row">
              <span className="av-name">{r.name}</span>
              <span className="av-cells">
                {hours.map((h) => {
                  const st = fromMin(h * 60);
                  const en = fromMin(h * 60 + 60);
                  const cls = !r.busy ? 'nodata' : isBusy(r.busy, date, st, en) ? 'busy' : '';
                  return <i key={h} className={cls} title={st} />;
                })}
              </span>
            </div>
          ))}
        </div>
        <div className="row wrap xs muted" style={{ gap: 12 }}>
          <span className="row" style={{ gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--fg3)', display: 'inline-block' }} />Ocupado</span>
          <span className="row" style={{ gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--sf)', border: '1px solid var(--ln)', display: 'inline-block' }} />Libre</span>
          <span className="row" style={{ gap: 5 }}><i className="av-cells" style={{ display: 'inline-block' }}><i className="nodata" style={{ width: 12, height: 12, display: 'block' }} /></i>Sin datos</span>
        </div>
        <div className="why"><b style={{ color: 'var(--fg)' }}>Privacidad: </b>cada miembro ve solo ocupado o libre, nunca el detalle de las actividades.</div>
      </section>

      <section className="stack">
        <div className="eyebrow">Mejores horarios · próximas 2 semanas</div>
        {suggestions.length === 0 && <div className="small muted">No hay horarios libres para ti en este rango.</div>}
        {suggestions.map((sg, i) => (
          <button key={sg.date + sg.start} className="slot" aria-pressed={pick === i} onClick={() => { setPick(i); setDate(sg.date); }}>
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>{capitalize(shortDate(sg.date))} · {sg.start} – {sg.end}</span>
              <span className="xs muted">{sg.free} de {sg.total} libres{sg.busyNames.length ? ' · ocupado: ' + sg.busyNames.join(', ') : ' · sin cruces'}</span>
            </span>
            {i === 0 && sg.free === sg.total && <span className="badge badge-ok">Recomendado</span>}
          </button>
        ))}
      </section>
      <button className="btn" onClick={schedule} disabled={!chosen}>Agendar y enviar invitación</button>
      <div className="xs muted center">Se agrega a tu calendario y se genera un archivo .ics para compartir con los miembros.</div>
      <div style={{ height: 30 }} />
    </div>
  );
}

