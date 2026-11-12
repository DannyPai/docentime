import { useState } from 'react';
import { toggleSubtask, toggleTask, useAppState } from '../lib/store';
import { relativeDate, todayISO } from '../lib/dates';
import { BackHeader, CheckButton, Empty } from '../ui/kit';
import { useNav } from '../ui/nav';
import * as Icon from '../ui/icons';

export default function TasksScreen() {
  const s = useAppState();
  const nav = useNav();
  const [filter, setFilter] = useState<'pendientes' | 'hechas' | 'todas'>('pendientes');
  const [open, setOpen] = useState<string | null>(null);
  const today = todayISO();
  const list = s.tasks
    .filter((t) => (filter === 'todas' ? true : filter === 'hechas' ? t.done : !t.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.priority === 'alta' ? -1 : 1));
  return (
    <>
      <div className="screen">
        <BackHeader title="Tareas" eyebrow={s.tasks.filter((t) => !t.done).length + ' pendientes'} onBack={nav.back} />
        <div className="seg" role="group" aria-label="Filtro">
          {(['pendientes', 'hechas', 'todas'] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'hechas' ? 'Completadas' : f === 'todas' ? 'Todas' : 'Pendientes'}</button>)}
        </div>
        {list.length === 0 && <Empty title={filter === 'hechas' ? 'Aún no completas tareas' : 'Sin tareas pendientes'} action={<button className="btn btn-sm" onClick={() => nav.sheet({ type: 'tarea' })}>Nueva tarea</button>} />}
        {list.map((t) => {
          const done = t.subtasks.filter((x) => x.done).length;
          const overdue = !t.done && t.due && t.due < today;
          const expanded = open === t.id;
          return (
            <div key={t.id} className="card" style={{ padding: 0, gap: 0 }}>
              <div className={'task' + (t.done ? ' task-done' : '')} style={{ border: 'none', background: 'transparent' }}>
                <CheckButton checked={t.done} onChange={() => toggleTask(t.id)} label={t.title} />
                <button className="grow" style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }} onClick={() => nav.sheet({ type: 'tarea', task: t })}>
                  <span className="task-title" style={{ display: 'block' }}>{t.title}</span>
                  <span className="xs" style={{ color: overdue ? 'var(--red-fg)' : 'var(--fg2)' }}>
                    {t.due ? (overdue ? 'Venció ' : 'Vence ') + relativeDate(t.due, today).toLowerCase() : 'Sin fecha'}
                    {t.priority === 'alta' ? ' · prioridad alta' : ''}
                  </span>
                </button>
                {t.subtasks.length > 0 && (
                  <button className="btn-link" onClick={() => setOpen(expanded ? null : t.id)} aria-expanded={expanded} style={{ color: 'var(--fg2)' }}>{done}/{t.subtasks.length}</button>
                )}
              </div>
              {t.subtasks.length > 0 && (
                <div style={{ padding: '0 14px 12px' }} className="stack">
                  <div className="row"><div className="progress"><span style={{ width: (done / t.subtasks.length) * 100 + '%' }} /></div></div>
                  {expanded && t.subtasks.map((st) => (
                    <div key={st.id} className="row anim-in" style={{ paddingLeft: 38 }}>
                      <CheckButton checked={st.done} onChange={() => toggleSubtask(t.id, st.id)} label={st.title} />
                      <span className="small grow" style={{ textDecoration: st.done ? 'line-through' : undefined, color: st.done ? 'var(--fg3)' : undefined }}>{st.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ height: 60 }} />
      </div>
      <button className="fab" onClick={() => nav.sheet({ type: 'tarea' })} aria-label="Nueva tarea"><Icon.Plus size={26} /></button>
    </>
  );
}
