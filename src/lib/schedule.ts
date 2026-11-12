// Motor del calendario: convierte horario de clases, bloques automáticos y actividades
// en ocurrencias concretas, y calcula huecos libres y cruces.
import type { AcademicDate, AppState, Course, Kind, Occ } from './types';
import { addDays, fromMin, inRange, overlaps, startOfWeek, toMin, todayISO, weekday } from './dates';

export const KIND_LABEL: Record<Kind, string> = {
  clase: 'Clases',
  comision: 'Comisión',
  proyecto: 'Proyecto',
  titulacion: 'Titulación',
  personal: 'Personal',
  plazo: 'Fecha límite'
};

export const KIND_ORDER: Kind[] = ['clase', 'comision', 'proyecto', 'titulacion', 'personal'];

export function courseName(c: Course): string {
  return c.subject + (c.parallel ? ' · ' + c.parallel : '');
}

/** Rango del semestre según el calendario académico (o uno amplio si no hay calendario). */
export function semesterRange(state: AppState): { from: string; to: string } {
  const f = state.calendar?.fechas ?? [];
  const starts = f.filter((d) => d.type === 'inicio').map((d) => d.date).sort();
  const ends = f.filter((d) => d.type === 'fin').map((d) => d.endDate ?? d.date).sort();
  const today = todayISO();
  return {
    from: starts[0] ?? addDays(today, -90),
    to: ends[ends.length - 1] ?? addDays(today, 180)
  };
}

export function holidaySet(state: AppState): Set<string> {
  const s = new Set<string>();
  for (const d of state.calendar?.fechas ?? []) {
    if (d.type !== 'feriado') continue;
    let cur = d.date;
    const end = d.endDate ?? d.date;
    while (cur <= end) {
      s.add(cur);
      cur = addDays(cur, 1);
    }
  }
  return s;
}

/** Fechas académicas que cubren un día. */
export function academicOn(state: AppState, date: string): AcademicDate[] {
  return (state.calendar?.fechas ?? []).filter((d) => inRange(date, d.date, d.endDate ?? d.date));
}

export function replacedKeys(state: AppState): Set<string> {
  const s = new Set(state.dismissed);
  for (const a of state.activities) if (a.replaces) s.add(a.replaces);
  return s;
}

function eachDay(from: string, to: string, fn: (d: string) => void) {
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 800) {
    fn(cur);
    cur = addDays(cur, 1);
  }
}

function rawClassSessions(state: AppState, from: string, to: string): Occ[] {
  const out: Occ[] = [];
  const sem = semesterRange(state);
  const hol = holidaySet(state);
  const a = from > sem.from ? from : sem.from;
  const b = to < sem.to ? to : sem.to;
  if (a > b) return out;
  eachDay(a, b, (date) => {
    if (hol.has(date)) return;
    const wd = weekday(date);
    for (const c of state.courses) {
      c.slots.forEach((s, i) => {
        if (s.weekday !== wd) return;
        out.push({
          key: 'clase:' + c.id + ':' + date + ':' + i,
          title: courseName(c),
          sub: c.room ? 'Aula ' + c.room : undefined,
          location: c.room,
          kind: 'clase',
          date,
          start: s.start,
          end: s.end,
          source: 'clase',
          courseId: c.id
        });
      });
    }
  });
  return out;
}

function activityOccs(state: AppState, from: string, to: string): Occ[] {
  return state.activities
    .filter((a) => a.date >= from && a.date <= to)
    .map((a) => ({
      key: 'act:' + a.id,
      title: a.title,
      sub: a.location,
      location: a.location,
      kind: a.kind,
      date: a.date,
      start: a.start,
      end: a.end,
      source: 'actividad' as const,
      activityId: a.id,
      projectId: a.projectId
    }));
}

/** Primer hueco libre de `dur` minutos en un día, dentro de [desde, hasta]. */
export function firstFree(busy: { start: string; end: string }[], dur: number, from: string, to: string): string | null {
  const sorted = busy.map((b) => [toMin(b.start), toMin(b.end)] as const).sort((x, y) => x[0] - y[0]);
  let t = toMin(from);
  const limit = toMin(to);
  // Empieza en un múltiplo de 30 min para que los horarios propuestos sean "redondos".
  t = Math.ceil(t / 30) * 30;
  while (t + dur <= limit) {
    const clash = sorted.find(([s, e]) => t < e && s < t + dur);
    if (!clash) return fromMin(t);
    t = Math.ceil(clash[1] / 30) * 30;
  }
  return null;
}

function isWeekday(date: string) {
  return weekday(date) <= 5;
}

/** Bloques semanales de preparación y calificación por materia. */
function generatedBlocks(state: AppState, from: string, to: string, replaced: Set<string>): Occ[] {
  const out: Occ[] = [];
  const courses = state.courses.filter((c) => c.prepBlocks || c.gradingBlocks);
  if (!courses.length) return out;
  const { dayStart, dayEnd, preferredGradingHour } = state.settings;
  const wFrom = startOfWeek(addDays(from, -3));
  const wTo = addDays(startOfWeek(addDays(to, 3)), 6);
  const sessions = rawClassSessions(state, wFrom, wTo).filter((o) => !replaced.has(o.key));
  const base = [...sessions, ...activityOccs(state, wFrom, wTo)];
  const busyOn = (date: string) => base.filter((o) => o.date === date).concat(out.filter((o) => o.date === date));

  let week = wFrom;
  let guard = 0;
  while (week <= wTo && guard++ < 60) {
    const weekEnd = addDays(week, 6);
    for (const c of courses) {
      const mine = sessions.filter((s) => s.courseId === c.id && s.date >= week && s.date <= weekEnd).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      if (!mine.length) continue;
      const first = mine[0];
      const last = mine[mine.length - 1];
      if (c.prepBlocks) {
        const key = 'prep:' + c.id + ':' + week;
        if (!replaced.has(key)) {
          const candidates = [addDays(first.date, -1), addDays(first.date, -2), addDays(first.date, -3), first.date].filter(isWeekday);
          for (const d of candidates) {
            const until = d === first.date ? first.start : dayEnd;
            const t = firstFree(busyOn(d), 60, dayStart, until);
            if (t) {
              out.push({ key, title: 'Preparar clase · ' + courseName(c), sub: 'Bloque automático', kind: 'clase', date: d, start: t, end: fromMin(toMin(t) + 60), source: 'bloque', courseId: c.id });
              break;
            }
          }
        }
      }
      if (c.gradingBlocks) {
        const key = 'calif:' + c.id + ':' + week;
        if (!replaced.has(key)) {
          const candidates = [last.date, addDays(last.date, 1), addDays(last.date, 2), addDays(last.date, 3)].filter(isWeekday);
          for (const d of candidates) {
            const after = d === last.date ? (toMin(last.end) > toMin(preferredGradingHour) ? last.end : preferredGradingHour) : preferredGradingHour;
            const t = firstFree(busyOn(d), 60, after, dayEnd) ?? firstFree(busyOn(d), 60, d === last.date ? last.end : dayStart, dayEnd);
            if (t) {
              out.push({ key, title: 'Calificar · ' + courseName(c), sub: 'Bloque automático', kind: 'clase', date: d, start: t, end: fromMin(toMin(t) + 60), source: 'bloque', courseId: c.id });
              break;
            }
          }
        }
      }
    }
    week = addDays(week, 7);
  }
  return out.filter((o) => o.date >= from && o.date <= to);
}

/** Todas las ocurrencias entre dos fechas (incluidas), ordenadas. */
export function occurrences(state: AppState, from: string, to: string): Occ[] {
  const replaced = replacedKeys(state);
  const classes = rawClassSessions(state, from, to).filter((o) => !replaced.has(o.key));
  const blocks = generatedBlocks(state, from, to, replaced);
  return [...activityOccs(state, from, to), ...classes, ...blocks].sort(
    (a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start) || a.title.localeCompare(b.title)
  );
}

export function occurrencesOn(state: AppState, date: string): Occ[] {
  return occurrences(state, date, date);
}

/** Ocurrencias que se cruzan con un horario. */
export function conflicts(state: AppState, date: string, start: string, end: string, ignore: string[] = []): Occ[] {
  return occurrencesOn(state, date).filter((o) => !ignore.includes(o.key) && overlaps(o.start, o.end, start, end));
}

/** Busca el primer hueco libre a partir de una fecha (máx. `days` días, solo lunes a viernes). */
export function findSlot(
  state: AppState,
  fromDate: string,
  dur: number,
  opts: { days?: number; notBefore?: string; ignore?: string[]; extraBusy?: { date: string; start: string; end: string }[]; weekends?: boolean } = {}
): { date: string; start: string; end: string } | null {
  const { dayStart, dayEnd } = state.settings;
  const days = opts.days ?? 10;
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    if (!opts.weekends && !isWeekday(d)) continue;
    if (holidaySet(state).has(d)) continue;
    const busy = occurrencesOn(state, d)
      .filter((o) => !(opts.ignore ?? []).includes(o.key))
      .concat((opts.extraBusy ?? []).filter((b) => b.date === d) as Occ[]);
    const from = i === 0 && opts.notBefore && toMin(opts.notBefore) > toMin(dayStart) ? opts.notBefore : dayStart;
    const t = firstFree(busy, dur, from, dayEnd);
    if (t) return { date: d, start: t, end: fromMin(toMin(t) + dur) };
  }
  return null;
}

/** Huecos libres de un día (mínimo `minDur` minutos). */
export function freeWindows(state: AppState, date: string, minDur = 60): { start: string; end: string }[] {
  const { dayStart, dayEnd } = state.settings;
  const busy = occurrencesOn(state, date).map((o) => [toMin(o.start), toMin(o.end)] as const).sort((a, b) => a[0] - b[0]);
  const out: { start: string; end: string }[] = [];
  let t = toMin(dayStart);
  for (const [s, e] of busy) {
    if (s - t >= minDur) out.push({ start: fromMin(t), end: fromMin(s) });
    t = Math.max(t, e);
  }
  if (toMin(dayEnd) - t >= minDur) out.push({ start: fromMin(t), end: dayEnd });
  return out;
}

export function minutesByKind(occs: Occ[]): Record<Kind, number> {
  const r: Record<Kind, number> = { clase: 0, comision: 0, proyecto: 0, titulacion: 0, personal: 0, plazo: 0 };
  for (const o of occs) r[o.kind] += toMin(o.end) - toMin(o.start);
  return r;
}

export function totalMinutes(occs: Occ[]): number {
  return occs.reduce((a, o) => a + toMin(o.end) - toMin(o.start), 0);
}

/** Pares de ocurrencias que se cruzan en un rango de fechas. */
export function overlapPairs(state: AppState, from: string, to: string): [Occ, Occ][] {
  const occs = occurrences(state, from, to);
  const out: [Occ, Occ][] = [];
  for (let i = 0; i < occs.length; i++) {
    for (let j = i + 1; j < occs.length && occs[j].date === occs[i].date; j++) {
      if (overlaps(occs[i].start, occs[i].end, occs[j].start, occs[j].end)) out.push([occs[i], occs[j]]);
    }
  }
  return out;
}

/** Próxima fecha límite de notas (hoy o después). */
export function nextGradesDeadline(state: AppState, today: string = todayISO()): AcademicDate | undefined {
  return (state.calendar?.fechas ?? [])
    .filter((d) => d.type === 'notas' && deadlineEnd(d) >= today)
    .sort((a, b) => deadlineEnd(a).localeCompare(deadlineEnd(b)))[0];
}

/** Último día de una fecha académica: en un rango de consignación, el día en que vence. */
export function deadlineEnd(d: AcademicDate): string {
  return d.endDate ?? d.date;
}

export const OVERLOAD_MIN = 8 * 60;
