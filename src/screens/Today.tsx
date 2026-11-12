import { useEffect, useMemo, useState } from 'react';
import { respondInvitation, toast, toastUndo, toggleGradesUploaded, toggleTask, useAppState } from '../lib/store';
import { capitalize, diffDays, hoursLabel, longDate, nowTime, relativeDate, shortDate, startOfWeek, todayISO, toMin } from '../lib/dates';
import { academicOn, courseName, freeWindows, nextGradesDeadline, occurrencesOn, OVERLOAD_MIN, semesterRange, totalMinutes } from '../lib/schedule';
import { CheckButton, Empty, EventItem } from '../ui/kit';
import { useNav } from '../ui/nav';
import * as Icon from '../ui/icons';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Today({ unseen }: { unseen: number }) {
  const s = useAppState();
  const nav = useNav();
  const now = useNow();
  const today = todayISO(now);
  const time = nowTime(now);
  const occs = useMemo(() => occurrencesOn(s, today), [s, today]);
  const academic = academicOn(s, today);
  const total = totalMinutes(occs);
  const deadline = nextGradesDeadline(s, today);
  const daysLeft = deadline ? diffDays(today, deadline.date) : null;
  const uploaded = deadline ? s.gradesUploaded[deadline.id] ?? [] : [];
  const sem = semesterRange(s);
  const week = Math.max(1, Math.floor(diffDays(startOfWeek(sem.from), today) / 7) + 1);
  const remaining = occs.filter((o) => toMin(o.end) > toMin(time));
  const pref = s.settings.preferredGradingHour;
  const gradingWindow = freeWindows(s, today, 60).find((w) => toMin(w.end) > toMin(time) && toMin(w.end) - Math.max(toMin(w.start), toMin(time)) >= 60 && toMin(w.end) > toMin(pref));
  const tasks = s.tasks
    .filter((t) => !t.done || (t.due && t.due >= today))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, 4);
  const pendingInv = s.invitations.find((i) => i.status === 'pendiente');
  const nowIndex = occs.findIndex((o) => toMin(o.start) > toMin(time));

  let summary: string;
  if (!occs.length) summary = 'Hoy no tienes actividades registradas.';
  else summary = occs.length + (occs.length === 1 ? ' actividad' : ' actividades') + ' y ' + hoursLabel(total) + ' de carga.';
  if (deadline && daysLeft !== null && daysLeft <= 14 && uploaded.length < s.courses.length) {
    summary += daysLeft <= 0 ? ' Hoy vence la carga de notas.' : ' Te quedan ' + daysLeft + (daysLeft === 1 ? ' día' : ' días') + ' para subir notas.';
  }

  return (
    <>
      <div className="screen">
        <div className="head">
          <div>
            <div className="eyebrow">{capitalize(shortDate(today))} · Semana {week}</div>
            <h1 className="h1">Tu día de hoy</h1>
          </div>
          <button className="icon-btn" onClick={() => nav.push({ name: 'notificaciones' })} aria-label={'Notificaciones' + (unseen ? ', ' + unseen + ' sin ver' : '')}>
            <Icon.Bell size={20} />
            {unseen > 0 && <span className="dot-badge" />}
          </button>
        </div>

        <section className="hero" aria-label="Resumen del asistente">
          <div className="row eyebrow"><Icon.Spark size={14} /> Resumen del asistente</div>
          <div className="hero-title">{summary}</div>
          <div className="hero-sub">
            {total > OVERLOAD_MIN
              ? 'Es un día cargado (más de 8 h). Pídeme mover algo si lo necesitas.'
              : gradingWindow
                ? 'Tu mejor hueco para calificar es de ' + (toMin(gradingWindow.start) < toMin(time) ? time : gradingWindow.start) + ' a ' + gradingWindow.end + '.'
                : remaining.length
                  ? 'Te quedan ' + remaining.length + (remaining.length === 1 ? ' actividad' : ' actividades') + ' por hoy.'
                  : 'Ya terminaste lo programado para hoy.'}
          </div>
          <button className="btn btn-light btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => nav.ask('Resumen de hoy')}>
            Preguntar al asistente
          </button>
        </section>

        {deadline && s.courses.length > 0 && daysLeft !== null && daysLeft <= 21 && (
          <section className="card" aria-label="Carga de calificaciones">
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600 }}>{deadline.title.replace('Límite de carga de notas · ', 'Carga de notas · ')}</span>
              <span className="badge badge-red" style={{ flex: 'none' }}>{daysLeft <= 0 ? 'Vence hoy' : daysLeft === 1 ? 'Mañana' : 'En ' + daysLeft + ' días'}</span>
            </div>
            <div className="small muted">Vence el {longDate(deadline.date)}, 23:59 · e-learning ESPOCH</div>
            <div className="row">
              <div className="progress"><span style={{ width: (uploaded.length / s.courses.length) * 100 + '%' }} /></div>
              <span className="mono">{uploaded.length} de {s.courses.length}</span>
            </div>
            <div className="stack">
              {s.courses.map((c) => {
                const on = uploaded.includes(c.id);
                return (
                  <div key={c.id} className="row">
                    <CheckButton checked={on} onChange={() => { toggleGradesUploaded(deadline.id, c.id); if (!on) toast('Notas de ' + courseName(c) + ' marcadas como subidas'); }} label={'Notas subidas · ' + courseName(c)} />
                    <span className="small grow" style={{ textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--fg3)' : undefined }}>{courseName(c)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {pendingInv && (
          <section className="card k-proyecto" aria-label="Invitación">
            <div className="ev-kind">Invitación · {pendingInv.from}</div>
            <div style={{ fontWeight: 600 }}>{pendingInv.title}</div>
            <div className="small muted">{capitalize(relativeDate(pendingInv.date, today))} · {pendingInv.start} – {pendingInv.end}</div>
            <div className="row">
              <button className="btn btn-sm grow" onClick={() => { respondInvitation(pendingInv.id, 'aceptada'); toastUndo('Invitación aceptada y agregada a tu calendario'); }}>Aceptar</button>
              <button className="btn btn-ghost btn-sm grow" onClick={() => nav.go('proyectos')}>Más opciones</button>
            </div>
          </section>
        )}

        <section className="stack" aria-label="Agenda">
          <div className="row-between">
            <h2 className="h2">Agenda</h2>
            <button className="btn-link" onClick={() => nav.go('calendario', { date: today })}>Ver semana</button>
          </div>
          {academic.map((a) => (
            <div key={a.id} className={'allday' + (a.type === 'feriado' ? ' feriado' : '')}>
              <span>{a.title}</span>
              <span className="mono" style={{ color: 'inherit' }}>ESPOCH</span>
            </div>
          ))}
          {occs.length === 0 ? (
            <Empty title="Sin actividades hoy" body="Agrega una o pídesela al asistente." action={<button className="btn btn-sm" onClick={() => nav.sheet({ type: 'nuevo-evento', date: today })}>Agregar actividad</button>} />
          ) : (
            occs.map((o, i) => (
              <div key={o.key} className="stack" style={{ gap: 6 }}>
                {i === nowIndex && <div className="now-line">Ahora · {time}</div>}
                <div style={{ opacity: toMin(o.end) <= toMin(time) ? 0.55 : 1 }}>
                  <EventItem o={o} onClick={() => nav.sheet({ type: 'evento', occ: o })} />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="stack" aria-label="Tareas">
          <div className="row-between">
            <h2 className="h2">Tareas</h2>
            <button className="btn-link" onClick={() => nav.push({ name: 'tareas' })}>Ver todas</button>
          </div>
          {tasks.length === 0 ? (
            <Empty title="No tienes tareas pendientes" action={<button className="btn btn-sm btn-ghost" onClick={() => nav.sheet({ type: 'tarea' })}>Nueva tarea</button>} />
          ) : (
            tasks.map((t) => {
              const done = t.subtasks.filter((x) => x.done).length;
              const overdue = !t.done && t.due && t.due < today;
              return (
                <div key={t.id} className={'task' + (t.done ? ' task-done' : '')}>
                  <CheckButton checked={t.done} onChange={() => toggleTask(t.id)} label={t.title} />
                  <button className="grow" style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }} onClick={() => nav.sheet({ type: 'tarea', task: t })}>
                    <span className="task-title" style={{ display: 'block' }}>{t.title}</span>
                    <span className="xs" style={{ color: overdue ? 'var(--red-fg)' : 'var(--fg2)' }}>
                      {t.due ? (overdue ? 'Venció ' : 'Vence ') + relativeDate(t.due, today).toLowerCase() : 'Sin fecha'}
                      {t.priority === 'alta' && !t.done ? ' · prioridad alta' : ''}
                      {t.subtasks.length ? ' · ' + done + '/' + t.subtasks.length : ''}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </section>

        {s.settings.designations.includes('titulacion') && s.theses.length > 0 && (
          <button className="li card" style={{ flexDirection: 'row' }} onClick={() => nav.push({ name: 'tesistas' })}>
            <span className="row"><Icon.Cap size={20} /><span><span className="li-title" style={{ display: 'block' }}>Tesistas</span><span className="li-sub">{s.theses.length} en seguimiento · próxima cita {nextThesis(s.theses, today)}</span></span></span>
            <Icon.Chevron size={18} />
          </button>
        )}
        <div style={{ height: 60 }} />
      </div>
      <button className="fab" onClick={() => nav.sheet({ type: 'rapido' })} aria-label="Registro rápido">
        <Icon.Plus size={26} />
      </button>
    </>
  );
}

function nextThesis(theses: { nextMeeting?: string }[], today: string): string {
  const next = theses.map((t) => t.nextMeeting).filter((x): x is string => !!x && x.slice(0, 10) >= today).sort()[0];
  return next ? relativeDate(next.slice(0, 10), today).toLowerCase() + ' ' + next.slice(11) : 'sin agendar';
}
