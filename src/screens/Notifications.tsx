import { useEffect } from 'react';
import type { Alert } from '../lib/alerts';
import { markSeen } from '../lib/alerts';
import { markNoticesRead } from '../lib/store';
import { BackHeader, Empty } from '../ui/kit';
import { useNav } from '../ui/nav';

const TYPE_LABEL: Record<Alert['type'], string> = { vencimiento: 'Vencimiento', cruce: 'Cruce de actividades', invitacion: 'Invitación', espoch: 'Calendario ESPOCH', proyecto: 'Proyecto' };

export default function Notifications({ alerts }: { alerts: Alert[] }) {
  const nav = useNav();
  useEffect(() => {
    markSeen(alerts);
    const t = setTimeout(markNoticesRead, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="screen">
      <BackHeader title="Notificaciones" onBack={nav.back} right={<button className="btn-link" onClick={() => nav.go('perfil')}>Ajustes</button>} />
      {alerts.length === 0 && <Empty title="Todo al día" body="Aquí verás vencimientos, cruces, invitaciones y cambios del calendario ESPOCH." />}
      {alerts.map((a) => (
        <section key={a.id} className={a.priority === 'alta' ? 'alert-card' : 'card'} style={a.read === false ? { borderColor: 'var(--red)' } : undefined}>
          <div className="row-between">
            <span className="eyebrow" style={{ color: a.priority === 'alta' ? 'var(--red-fg)' : undefined }}>{TYPE_LABEL[a.type]}{a.priority === 'alta' ? ' · prioridad alta' : ''}</span>
            {a.read === false && <span className="badge badge-red">Nuevo</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</div>
          <div className="small muted">{a.body}</div>
          {a.action && (
            <button
              className={'btn btn-sm ' + (a.priority === 'alta' ? '' : 'btn-ghost')}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (a.action!.to === 'asistente') nav.ask(a.action!.prompt ?? '');
                else if (a.action!.to === 'calendario') nav.go('calendario', { date: a.action!.date });
                else nav.go('proyectos');
              }}
            >
              {a.action.label}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
