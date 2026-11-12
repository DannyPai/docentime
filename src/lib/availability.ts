// Disponibilidad compartida sin servidor: cada docente exporta un código con sus bloques
// ocupados (solo ocupado/libre, sin detalle) y el coordinador lo importa en el proyecto.
import type { AppState, BusyBlock, Member, Project } from './types';
import { addDays, diffDays, fromMin, todayISO, toMin, weekday } from './dates';
import { holidaySet, occurrences } from './schedule';

export function myBusy(state: AppState, from: string, to: string): BusyBlock[] {
  return occurrences(state, from, to).map((o) => ({ date: o.date, start: o.start, end: o.end }));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Disponibilidad simulada y estable para miembros de ejemplo. */
function demoBusy(member: Member, from: string, to: string): BusyBlock[] {
  const out: BusyBlock[] = [];
  let d = from;
  while (d <= to) {
    if (weekday(d) <= 5) {
      const h = hash(member.name + d);
      const blocks = 2 + (h % 2);
      for (let i = 0; i < blocks; i++) {
        const start = 7 + ((h >>> (i * 5)) % 10);
        const len = 1 + ((h >>> (i * 3 + 7)) % 2);
        out.push({ date: d, start: fromMin(start * 60), end: fromMin(Math.min(19, start + len) * 60) });
      }
    }
    d = addDays(d, 1);
  }
  return out;
}

export function memberBusy(member: Member, from: string, to: string): BusyBlock[] | null {
  if (member.demo) return demoBusy(member, from, to);
  if (!member.busyUpdatedAt) return null;
  return member.busy.filter((b) => b.date >= from && b.date <= to);
}

export function isBusy(blocks: BusyBlock[], date: string, start: string, end: string): boolean {
  return blocks.some((b) => b.date === date && toMin(b.start) < toMin(end) && toMin(start) < toMin(b.end));
}

export interface SlotSuggestion {
  date: string;
  start: string;
  end: string;
  free: number;
  total: number;
  busyNames: string[];
}

/** Mejores horarios comunes para una reunión del proyecto. */
export function commonSlots(state: AppState, project: Project, fromDate: string, days: number, dur: number, limit = 5): SlotSuggestion[] {
  const to = addDays(fromDate, days);
  const mine = myBusy(state, fromDate, to);
  const others = project.members.map((m) => ({ m, busy: memberBusy(m, fromDate, to) })).filter((x) => x.busy);
  const hol = holidaySet(state);
  const total = 1 + others.length;
  const out: SlotSuggestion[] = [];
  const now = new Date();
  for (let i = 0; i <= days; i++) {
    const d = addDays(fromDate, i);
    if (weekday(d) > 5 || hol.has(d)) continue;
    for (let t = toMin(state.settings.dayStart); t + dur <= toMin(state.settings.dayEnd); t += 30) {
      const s = fromMin(t);
      const e = fromMin(t + dur);
      if (d === todayISO() && t <= now.getHours() * 60 + now.getMinutes()) continue;
      if (isBusy(mine, d, s, e)) continue; // el coordinador debe estar libre
      const busyNames = others.filter((x) => isBusy(x.busy!, d, s, e)).map((x) => x.m.name);
      out.push({ date: d, start: s, end: e, free: total - busyNames.length, total, busyNames });
    }
  }
  return out.sort((a, b) => b.free - a.free || a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start)).slice(0, limit);
}

// ---------- Código de disponibilidad ----------
interface Payload {
  v: 1;
  n: string;
  f: string;
  b: [number, number, number][];
}

function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

export function exportAvailability(state: AppState, days = 28): string {
  const from = todayISO();
  const busy = myBusy(state, from, addDays(from, days));
  const payload: Payload = { v: 1, n: state.settings.name || 'Docente', f: from, b: busy.map((x) => [diffDays(from, x.date), toMin(x.start), toMin(x.end)]) };
  return 'DT1:' + b64encode(JSON.stringify(payload));
}

export function parseAvailability(code: string): { name: string; busy: BusyBlock[] } | null {
  try {
    const raw = code.trim().replace(/^DT1:/, '');
    const p = JSON.parse(b64decode(raw)) as Payload;
    if (p.v !== 1 || !Array.isArray(p.b)) return null;
    return { name: p.n, busy: p.b.map(([d, s, e]) => ({ date: addDays(p.f, d), start: fromMin(s), end: fromMin(e) })) };
  } catch {
    return null;
  }
}
