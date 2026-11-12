// Notificaciones inteligentes calculadas a partir de los datos: vencimientos, cruces,
// invitaciones y cambios del calendario ESPOCH. Opcionalmente se muestran como
// notificaciones del sistema mientras la app está abierta.
import type { AppState, Kind } from './types';
import { addDays, diffDays, longDate, nowTime, shortDate, todayISO, toMin } from './dates';
import { courseName, nextGradesDeadline, overlapPairs } from './schedule';

export interface Alert {
  id: string;
  type: 'vencimiento' | 'cruce' | 'invitacion' | 'espoch' | 'proyecto';
  priority: 'alta' | 'media';
  title: string;
  body: string;
  kind: Kind;
  action?: { label: string; to: 'asistente' | 'calendario' | 'proyectos'; prompt?: string; date?: string };
  read?: boolean;
  at?: string;
}

export function computeAlerts(state: AppState, today: string = todayISO()): Alert[] {
  const out: Alert[] = [];
  const maxH = Math.max(24, ...state.settings.reminders);
  const maxDays = Math.ceil(maxH / 24);

  const dl = nextGradesDeadline(state, today);
  if (dl) {
    const days = diffDays(today, dl.date);
    const pending = state.courses.filter((c) => !(state.gradesUploaded[dl.id] ?? []).includes(c.id));
    if (days <= Math.max(maxDays, 7) && pending.length) {
      out.push({
        id: 'notas:' + dl.id,
        type: 'vencimiento',
        priority: 'alta',
        kind: 'plazo',
        title: days <= 0 ? 'Hoy vence la carga de notas' : 'Faltan ' + days + (days === 1 ? ' día' : ' días') + ' para subir notas',
        body: dl.title + ' · ' + longDate(dl.date) + '. Pendiente: ' + pending.map(courseName).join(', ') + '.',
        action: { label: 'Ver pendientes', to: 'asistente', prompt: '¿Qué tengo pendiente antes de subir notas?' }
      });
    }
  }

  for (const t of state.tasks) {
    if (t.done || !t.due) continue;
    const days = diffDays(today, t.due);
    if (days < 0) {
      out.push({ id: 'tarea-vencida:' + t.id, type: 'vencimiento', priority: 'alta', kind: t.kind, title: 'Tarea vencida', body: t.title + ' · venció el ' + shortDate(t.due) });
    } else if (state.settings.reminders.some((h) => days * 24 <= h) && days <= maxDays) {
      out.push({ id: 'tarea:' + t.id + ':' + days, type: 'vencimiento', priority: t.priority === 'alta' || days <= 1 ? 'alta' : 'media', kind: t.kind, title: days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : 'Vence en ' + days + ' días', body: t.title });
    }
  }

  for (const [a, b] of overlapPairs(state, today, addDays(today, 14)).slice(0, 5)) {
    out.push({
      id: 'cruce:' + a.key + ':' + b.key,
      type: 'cruce',
      priority: 'media',
      kind: a.kind,
      title: 'Cruce de actividades · ' + shortDate(a.date),
      body: a.title + ' (' + a.start + ') y ' + b.title + ' (' + b.start + ') coinciden.',
      action: { label: 'Ver en el calendario', to: 'calendario', date: a.date }
    });
  }

  for (const inv of state.invitations.filter((i) => i.status === 'pendiente')) {
    out.push({ id: 'inv:' + inv.id, type: 'invitacion', priority: 'media', kind: 'proyecto', title: 'Invitación de ' + inv.from, body: inv.title + ' · ' + shortDate(inv.date) + ' · ' + inv.start, action: { label: 'Responder', to: 'proyectos' } });
  }

  for (const n of state.notices.slice(0, 10)) {
    out.push({ id: 'aviso:' + n.id, type: n.kind === 'cambio-espoch' ? 'espoch' : 'proyecto', priority: 'media', kind: 'plazo', title: n.title, body: n.body, read: n.read, at: n.createdAt });
  }

  return out.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'alta' ? -1 : 1));
}

// ---------- Visto / notificado ----------
const SEEN = 'docentime:vistas';
const SENT = 'docentime:enviadas';

function readSet(k: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(k) ?? '[]'));
  } catch {
    return new Set();
  }
}
function writeSet(k: string, s: Set<string>) {
  try {
    localStorage.setItem(k, JSON.stringify([...s].slice(-300)));
  } catch {
    /* sin almacenamiento */
  }
}

export function unseenCount(alerts: Alert[]): number {
  const seen = readSet(SEEN);
  return alerts.filter((a) => !seen.has(a.id) && a.read !== true).length;
}

export function markSeen(alerts: Alert[]) {
  const seen = readSet(SEEN);
  alerts.forEach((a) => seen.add(a.id));
  writeSet(SEEN, seen);
}

export function inQuietHours(state: AppState, now: Date = new Date()): boolean {
  const s = state.settings;
  if (s.dnd) return true;
  const t = toMin(nowTime(now));
  const a = toMin(s.quietFrom);
  const b = toMin(s.quietTo);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** Envía notificaciones del sistema para alertas de prioridad alta aún no enviadas. */
export function notifySystem(state: AppState, alerts: Alert[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || inQuietHours(state)) return;
  const sent = readSet(SENT);
  for (const a of alerts.filter((x) => x.priority === 'alta' && !sent.has(x.id + ':' + todayISO()))) {
    try {
      new Notification('DocenTime · ' + a.title, { body: a.body, icon: './icon-192.png', tag: a.id });
      sent.add(a.id + ':' + todayISO());
    } catch {
      /* algunos navegadores solo permiten notificar desde el service worker */
    }
  }
  writeSet(SENT, sent);
}
