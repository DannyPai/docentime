// Asistente en modo demo: reglas y respuestas predefinidas que actúan sobre los datos reales
// del docente. No usa ninguna API externa. Toda modificación se devuelve como propuesta
// (vista previa) que el docente confirma o cancela.
import type { AppState, ChatMessage, Kind, Occ, Op, Proposal, Task } from './types';
import {
  addDays, capitalize, durationLabel, fromISO, fromMin, hoursLabel, longDate, MONTHS, nowTime, relativeDate, shortDate, startOfWeek, toISO, toMin, uid, weekday
} from './dates';
import {
  academicOn, conflicts, courseName, deadlineEnd, findSlot, freeWindows, KIND_LABEL, KIND_ORDER, minutesByKind, nextGradesDeadline, occurrences, occurrencesOn, OVERLOAD_MIN, totalMinutes
} from './schedule';
import { opsForDelete, opsForEdit } from './store';

export type Reply = Omit<ChatMessage, 'id' | 'at' | 'from'>;

export const SUGGESTIONS = [
  '¿Qué tengo pendiente antes de subir notas?',
  'Resumen de hoy',
  'Agrega una reunión del proyecto de vinculación el jueves a las 10',
  '¿Cuándo tengo libre mañana?',
  'Resumen semanal'
];

// ---------- Normalización ----------
/** Minúsculas, sin tildes y sin signos, conservando la longitud para poder recortar el texto original. */
export function norm(s: string): string {
  return s
    .normalize('NFC')
    .split('')
    .map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ' ')
    .join('')
    .replace(/[¿?¡!,.;:"'()]/g, (m) => (m === ':' ? ':' : ' '));
}

interface Span {
  start: number;
  end: number;
}

const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const MONTHS_N = MONTHS.map((m) => norm(m));
const NUM_WORDS: Record<string, number> = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, media: 0.5 };

export interface DateHit extends Span {
  date: string;
  /** Desplazamiento de semana ("la próxima semana") sin día concreto. */
  weekShift?: boolean;
}

/** Encuentra todas las expresiones de fecha, en orden de aparición. */
export function findDates(n: string, today: string): DateHit[] {
  const hits: DateHit[] = [];
  const push = (h: DateHit) => {
    if (!hits.some((x) => h.start < x.end && x.start < h.end)) hits.push(h);
  };
  let m: RegExpExecArray | null;

  const reWeekday = /\b(?:(?:el|este|esta|para el|del|al|hasta el)\s+)?(?:(proximo|siguiente)\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\s+(?:que viene|proximo|de la (?:proxima|otra|siguiente) semana))?\b/g;
  while ((m = reWeekday.exec(n))) {
    const wd = WEEKDAYS.indexOf(m[2]) + 1;
    let delta = (wd - weekday(today) + 7) % 7;
    const nextWeek = m[3] && /semana/.test(m[3]);
    if (nextWeek) delta = wd - weekday(today) + 7;
    else if ((m[1] || (m[3] && /que viene|proximo/.test(m[3]))) && delta === 0) delta = 7;
    push({ start: m.index, end: m.index + m[0].length, date: addDays(today, delta) });
  }

  const reMonth = new RegExp('\\b(?:el\\s+|del\\s+|al\\s+|para el\\s+)?(\\d{1,2})\\s+de\\s+(' + MONTHS_N.join('|') + ')\\b', 'g');
  while ((m = reMonth.exec(n))) {
    const day = Number(m[1]);
    const month = MONTHS_N.indexOf(m[2]);
    const t = fromISO(today);
    let d = new Date(t.getFullYear(), month, day);
    if (toISO(d) < addDays(today, -30)) d = new Date(t.getFullYear() + 1, month, day);
    push({ start: m.index, end: m.index + m[0].length, date: toISO(d) });
  }

  const reSlash = /\b(?:el\s+|del\s+|al\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  while ((m = reSlash.exec(n))) {
    const t = fromISO(today);
    let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : t.getFullYear();
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && toISO(d) < addDays(today, -30)) d = new Date(++y, Number(m[2]) - 1, Number(m[1]));
    push({ start: m.index, end: m.index + m[0].length, date: toISO(d) });
  }

  const reRel = /\b(pasado manana|manana|hoy|ayer)\b/g;
  while ((m = reRel.exec(n))) {
    if (m[1] === 'manana') {
      const before = n.slice(Math.max(0, m.index - 4), m.index);
      if (/\b(la|en|por|de)\s$/.test(before)) continue; // "en la mañana" = parte del día
    }
    const delta = m[1] === 'pasado manana' ? 2 : m[1] === 'manana' ? 1 : m[1] === 'hoy' ? 0 : -1;
    push({ start: m.index, end: m.index + m[0].length, date: addDays(today, delta) });
  }

  const reWeek = /\b(?:(?:a|para|hasta)\s+)?(?:la\s+)?(?:proxima|siguiente|otra)\s+semana\b|\b(?:(?:a|para)\s+)?la\s+semana\s+que\s+viene\b/g;
  while ((m = reWeek.exec(n))) {
    push({ start: m.index, end: m.index + m[0].length, date: addDays(startOfWeek(today), 7), weekShift: true });
  }

  const reDayNum = /\b(?:el|del|al|para el)\s+(\d{1,2})\b(?!\s*(?::|h\b|de\b|am\b|pm\b|\/))/g;
  while ((m = reDayNum.exec(n))) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const t = fromISO(today);
    let d = new Date(t.getFullYear(), t.getMonth(), day);
    if (toISO(d) < today) d = new Date(t.getFullYear(), t.getMonth() + 1, day);
    push({ start: m.index, end: m.index + m[0].length, date: toISO(d) });
  }

  return hits.sort((a, b) => a.start - b.start);
}

export interface TimeHit extends Span {
  start_: string;
  end_?: string;
}

function toHour(h: number, mer?: string, part?: string): number {
  if (mer === 'pm' || part === 'tarde' || part === 'noche') return h < 12 ? h + 12 : h;
  if (mer === 'am' || part === 'manana') return h === 12 ? 0 : h;
  if (h >= 1 && h <= 6) return h + 12; // "a las 3" en contexto laboral = 15:00
  return h;
}

/** Encuentra horas ("a las 10", "10:30", "3 pm", "de 10 a 12"). */
export function findTimes(n: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const push = (h: TimeHit) => {
    if (!hits.some((x) => h.start < x.end && x.start < h.end)) hits.push(h);
  };
  const fmt = (h: number, mm?: string) => fromMin(h * 60 + Number(mm ?? 0));
  let m: RegExpExecArray | null;

  const reRange = /\b(?:de|desde)\s+(?:las\s+|la\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?\s+(?:a|hasta)\s+(?:las\s+|la\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?(?:\s+de\s+la\s+(manana|tarde|noche))?\b/g;
  while ((m = reRange.exec(n))) {
    const part = m[7];
    let h1 = toHour(Number(m[1]), m[3], part);
    const h2 = toHour(Number(m[4]), m[6], part);
    if (h1 > h2 && h1 - 12 >= 0 && !m[3]) h1 -= 12;
    push({ start: m.index, end: m.index + m[0].length, start_: fmt(h1, m[2]), end_: fmt(h2, m[5]) });
  }

  const reAt = /\b(?:a\s+las|a\s+la|para\s+las|desde\s+las|tipo|las)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|h|hrs)?(?:\s+(?:y\s+media))?(?:\s+de\s+la\s+(manana|tarde|noche))?/g;
  while ((m = reAt.exec(n))) {
    const half = /y\s+media/.test(m[0]);
    const h = toHour(Number(m[1]), m[3], m[4]);
    push({ start: m.index, end: m.index + m[0].length, start_: fmt(h, half ? '30' : m[2]) });
  }

  const reClock = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/g;
  while ((m = reClock.exec(n))) push({ start: m.index, end: m.index + m[0].length, start_: fmt(toHour(Number(m[1]), m[3] ?? (Number(m[1]) >= 7 ? 'h' : undefined)), m[2]) });

  const reMer = /\b(\d{1,2})\s*(am|pm)\b/g;
  while ((m = reMer.exec(n))) push({ start: m.index, end: m.index + m[0].length, start_: fmt(toHour(Number(m[1]), m[2])) });

  const reNoon = /\b(?:al\s+|a\s+)?mediodia\b/g;
  while ((m = reNoon.exec(n))) push({ start: m.index, end: m.index + m[0].length, start_: '12:00' });

  return hits.sort((a, b) => a.start - b.start);
}

/** Duración explícita en minutos ("por 2 horas", "hora y media", "30 minutos"). */
export function findDuration(n: string): (Span & { min: number }) | null {
  const m = /\b(?:por|durante|de)\s+(\d+(?:[.,]\d+)?|una|un|media|dos|tres|cuatro)\s*(horas?|h|hrs|minutos|min)(\s+y\s+media)?\b/.exec(n) ?? /\b(una\s+hora\s+y\s+media|hora\s+y\s+media)\b/.exec(n);
  if (!m) return null;
  if (/hora\s+y\s+media/.test(m[0]) && !m[2]) return { start: m.index, end: m.index + m[0].length, min: 90 };
  const q = NUM_WORDS[m[1]] ?? Number(String(m[1]).replace(',', '.'));
  const mins = /min/.test(m[2]) ? q : q * 60 + (m[3] ? 30 : 0);
  return { start: m.index, end: m.index + m[0].length, min: Math.round(mins) };
}

/** Parte del día ("en la mañana", "por la tarde", "todo el día"). */
export function findPartOfDay(n: string, dayStart: string, dayEnd: string): (Span & { from: string; to: string; label: string }) | null {
  let m = /\b(?:en|por|durante|toda)\s+la\s+(manana|tarde)\b/.exec(n);
  if (m) return m[1] === 'manana' ? { start: m.index, end: m.index + m[0].length, from: dayStart, to: '13:00', label: 'en la mañana' } : { start: m.index, end: m.index + m[0].length, from: '13:00', to: dayEnd, label: 'en la tarde' };
  m = /\btodo\s+el\s+dia\b/.exec(n);
  if (m) return { start: m.index, end: m.index + m[0].length, from: dayStart, to: dayEnd, label: 'todo el día' };
  return null;
}

export function detectKind(n: string): Kind {
  if (/\b(tesis|tesista|titulacion|tribunal|defensa|tutoria|anteproyecto)/.test(n)) return 'titulacion';
  if (/\b(vinculacion|investigacion|proyecto|hito|entregable)/.test(n)) return 'proyecto';
  if (/\b(comision|consejo|junta)/.test(n)) return 'comision';
  if (/\b(clase|materia|paralelo|recuperacion|leccion|examen|calificar|notas|deber|tarea de los estudiantes)/.test(n)) return 'clase';
  return 'personal';
}

const STOP = new Set(
  'el la los las de del a al que mi mis con para por un una unos unas y o en lo le se me su sus es este esta ese esa proxima siguiente otra semana dia hoy manana pasado ayer hora horas las favor quiero puedes podrias necesito'.split(' ')
);

function tokens(n: string): string[] {
  return n.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

function removeSpans(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of sorted) out = out.slice(0, s.start) + ' ' + out.slice(s.end);
  return out;
}

const LEADING = /^\s*(?:por\s+favor\s+)?(?:(?:me\s+)?(?:puedes|podrias)\s+)?(agrega(?:r|me)?|anade|anadir|crea(?:r|me)?|programa(?:r|me)?|agenda(?:r|me)?|pon(?:me|er)?|registra(?:r|me)?|apunta(?:r|me)?|recuerdame|anota(?:r|me)?|nueva|nuevo|mueve(?:me)?|mover|muevo|cambia(?:r)?|pasa(?:r)?|reprograma(?:r)?|traslada(?:r)?|aplaza(?:r)?|posterga(?:r)?|adelanta(?:r)?|corre(?:r)?|elimina(?:r)?|borra(?:r)?|cancela(?:r)?|quita(?:r)?|suprime|anula(?:r)?)\b\s*(?:que\s+)?(?:(?:una|un|la|el|los|las|mi|mis)\s+)?(?:(?:nueva|nuevo)\s+)?(?:(?:tarea|actividad|evento)\s*(?:de|para|:)?\s+)?/;

function cleanTitle(orig: string, n: string, spans: Span[]): string {
  const lead = LEADING.exec(n);
  const allSpans = lead ? [...spans, { start: 0, end: lead[0].length }] : spans;
  let t = removeSpans(orig, allSpans).replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim();
  const edge = /^(de|del|el|la|para|a|al|que|en|con|y|:|-)\s+|\s+(de|del|el|la|para|a|al|que|en|con|y|igual|de todos modos)$/i;
  for (let i = 0; i < 4; i++) t = t.replace(edge, '').trim();
  t = t.replace(/[.,;:]+$/, '').trim();
  return capitalize(t);
}

function fmtRange(o: { date: string; start: string; end: string }, today: string) {
  return relativeDate(o.date, today) + ' · ' + o.start + ' – ' + o.end;
}

/** Busca la actividad a la que se refiere el docente. */
function findTarget(state: AppState, n: string, spans: Span[], today: string, onDate?: string): { best?: Occ; score: number; options: Occ[] } {
  const lead = LEADING.exec(n);
  const q = tokens(removeSpans(n, lead ? [...spans, { start: 0, end: lead[0].length }] : spans));
  const from = onDate ?? addDays(today, -1);
  const to = onDate ?? addDays(today, 45);
  const occs = occurrences(state, from, to);
  const scored = occs
    .map((o) => {
      const hay = norm(o.title + ' ' + (o.sub ?? '') + ' ' + KIND_LABEL[o.kind]);
      const words = hay.split(/\s+/);
      let score = 0;
      for (const t of q) {
        if (words.includes(t)) score += 2;
        else if (t.length >= 4 && words.some((w) => w.startsWith(t.slice(0, Math.max(4, t.length - 2))))) score += 1;
      }
      return { o, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Math.abs(a.o.date.localeCompare(today)) - Math.abs(b.o.date.localeCompare(today)) || (a.o.date + a.o.start).localeCompare(b.o.date + b.o.start));
  const upcoming = scored.filter((x) => x.o.date >= today);
  const pick = (upcoming.length && upcoming[0].score >= scored[0]?.score ? upcoming : scored)[0];
  return { best: pick?.o, score: pick?.score ?? 0, options: scored.slice(0, 4).map((x) => x.o) };
}

function proposal(p: Omit<Proposal, 'status'>): Proposal {
  return { ...p, status: 'pendiente' };
}

// ---------- Intenciones ----------
const RE = {
  reorg: /\b(imprevisto|feriado|evento institucional|suspend\w*|no (?:habra|hay|tendre) clases?|reorganiz\w*|surgio|surgieron|se cancelan las clases|paro|asamblea|emergencia|reunion urgente)\b/,
  del: /\b(elimina|eliminar|borra|borrar|cancela|cancelar|quita|quitar|suprime|anula|anular)\b/,
  move: /\b(mueve|mover|muevo|muevela|cambia|cambiar|pasa|pasar|reprograma|reprogramar|traslada|trasladar|aplaza|aplazar|posterga|postergar|adelanta|adelantar|atrasa|retrasa|corre|correr)\b/,
  create: /\b(agrega|agregar|agregame|anade|anadir|crea|crear|creame|programa|programar|agenda|agendar|agendame|pon|ponme|registra|registrar|apunta|anota|anotame|recuerdame|nueva|nuevo)\b/,
  task: /\b(tarea|recuerdame|pendiente:)\b/,
  pending: /\b(pendiente|pendientes|me falta|falta|faltan|por hacer|antes de subir notas|que debo)\b/,
  free: /\b(libre|libres|hueco|huecos|disponible|disponibilidad|cuando puedo|espacio)\b/,
  week: /\b(semana|semanal|carga horaria|carga)\b/,
  day: /\b(hoy|manana|mi dia|que tengo|agenda|resumen|pasado manana|lunes|martes|miercoles|jueves|viernes)\b/,
  hello: /^(hola|buenos dias|buenas tardes|buenas noches|buenas|hey|saludos)\b/,
  thanks: /\b(gracias|genial|perfecto|excelente|ok|listo)\b/,
  help: /\b(ayuda|que puedes hacer|como funciona|que sabes)\b/
};

export function reply(state: AppState, text: string, now: Date = new Date()): Reply {
  const today = toISO(now);
  const orig = text.normalize('NFC');
  const n = norm(orig);
  const { dayStart, dayEnd } = state.settings;

  if (!n.trim()) return { text: 'Escribe o dicta lo que necesitas.' };

  if (RE.reorg.test(n) && !RE.create.test(n.split(' ').slice(0, 1).join(' '))) return reorganize(state, orig, n, today);
  if (RE.del.test(n)) return remove(state, orig, n, today);
  if (RE.move.test(n)) return move(state, orig, n, today, now);
  if (RE.create.test(n)) return RE.task.test(n) ? createTask(state, orig, n, today) : create(state, orig, n, today, now);
  if (RE.pending.test(n)) return pending(state, today);
  if (RE.free.test(n)) return free(state, n, today, dayStart, dayEnd);
  if (RE.week.test(n)) return weekSummary(state, n, today);
  if (RE.day.test(n)) return daySummary(state, findDates(n, today)[0]?.date ?? today, today);
  if (RE.hello.test(n.trim())) {
    return { text: 'Hola. ¿Qué organizamos? Puedo crear, mover o eliminar actividades, avisarte de plazos y reorganizar tu semana.', chips: SUGGESTIONS.slice(0, 3) };
  }
  if (RE.thanks.test(n)) return { text: 'Con gusto. Aquí estoy si necesitas algo más.' };
  return help();
}

function help(): Reply {
  return {
    text: 'Estoy en modo demo y entiendo pedidos como estos:',
    list: [
      { label: 'Crear', value: '“Agrega tutoría con Ana el viernes a las 3”' },
      { label: 'Mover', value: '“Mueve la revisión de tesis de Pedro a la próxima semana”' },
      { label: 'Eliminar', value: '“Cancela la cita médica”' },
      { label: 'Tareas', value: '“Agrega una tarea: revisar informe para el lunes”' },
      { label: 'Imprevistos', value: '“El jueves en la mañana hay evento institucional”' },
      { label: 'Consultas', value: '“¿Qué tengo pendiente antes de subir notas?”' }
    ],
    chips: SUGGESTIONS.slice(0, 4)
  };
}

function create(state: AppState, orig: string, n: string, today: string, now: Date): Reply {
  const dates = findDates(n, today);
  const times = findTimes(n);
  const dur = findDuration(n);
  const force = /\b(igual|de todos modos|aunque se cruce)\b/.test(n);
  const spans: Span[] = [...dates, ...times, ...(dur ? [dur] : [])];
  let title = cleanTitle(orig, n, spans);
  if (!title || title.length < 3) title = 'Actividad';
  const kind = detectKind(n);
  const project = state.projects.find((p) => tokens(norm(p.name)).some((t) => t.length > 4 && n.includes(t))) ?? (kind === 'proyecto' ? state.projects.find((p) => n.includes(p.type)) : undefined);

  let date = dates[0]?.date ?? today;
  if (dates[0]?.weekShift) date = addDays(date, 0);
  const t = times[0];
  let minutes = dur?.min ?? (t?.end_ ? toMin(t.end_) - toMin(t.start_) : 60);
  if (minutes <= 0) minutes = 60;
  let start = t?.start_;
  let note = '';
  if (!start) {
    const slot = findSlot(state, date, minutes, { days: 7, notBefore: date === today ? nowTime(now) : undefined });
    if (!slot) return { text: 'No encontré un hueco libre de ' + durationLabel('00:00', fromMin(minutes)) + ' en los próximos días. Dime una hora concreta.' };
    date = slot.date;
    start = slot.start;
    note = 'Como no indicaste hora, elegí el primer hueco libre.';
  } else if (!dates.length && date === today && toMin(start) < toMin(nowTime(now))) {
    date = addDays(today, 1);
  }
  let end = t?.end_ && !dur ? t.end_ : fromMin(toMin(start) + minutes);
  const clash = conflicts(state, date, start, end);
  let warning: string | undefined;
  if (clash.length && !force) {
    const alt = findSlot(state, date, minutes, { days: 1, notBefore: start }) ?? findSlot(state, date, minutes, { days: 1 });
    if (alt && alt.date === date) {
      warning = 'A las ' + start + ' tienes ' + clash.map((c) => c.title).join(' y ') + '. Te propongo ' + alt.start + ', el siguiente hueco libre.';
      start = alt.start;
      end = alt.end;
    } else {
      warning = 'Se cruza con ' + clash.map((c) => c.title).join(' y ') + '.';
    }
  }
  const ops: Op[] = [{ type: 'add', activity: { id: uid('a'), title, kind, date, start, end, projectId: project?.id, source: 'asistente' } }];
  const rows = [
    { label: 'Cuándo', value: capitalize(longDate(date)) + ' · ' + start + ' – ' + end },
    { label: 'Tipo', value: KIND_LABEL[kind] + (project ? ' · ' + project.name : '') }
  ];
  const remaining = conflicts(state, date, start, end);
  rows.push({ label: 'Cruces', value: remaining.length ? remaining.map((c) => c.title).join(', ') : 'Ninguno' });
  return {
    text: note || 'Esto es lo que voy a agregar. Revísalo antes de aplicar:',
    proposal: proposal({ tag: 'Nueva actividad', title, rows, warning, ops, doneText: 'Listo. Agregué «' + title + '» el ' + longDate(date) + ' a las ' + start + '.' }),
    chips: warning && !force ? [orig + ' igual'] : undefined
  };
}

function createTask(state: AppState, orig: string, n: string, today: string): Reply {
  const dates = findDates(n, today);
  const times = findTimes(n);
  const title = cleanTitle(orig, n, [...dates, ...times]) || 'Nueva tarea';
  const kind = detectKind(n);
  const due = dates[0]?.date;
  const priority: Task['priority'] = /\b(urgente|importante|prioridad alta)\b/.test(n) ? 'alta' : 'media';
  const task: Task = { id: uid('k'), title: title.replace(/\b(urgente|importante)\b/gi, '').trim() || title, kind, due, priority, done: false, subtasks: [], createdAt: new Date().toISOString() };
  void state;
  return {
    text: 'Agrego esta tarea a tu lista:',
    proposal: proposal({
      tag: 'Nueva tarea',
      title: task.title,
      rows: [
        { label: 'Vence', value: due ? capitalize(longDate(due)) : 'Sin fecha' },
        { label: 'Prioridad', value: capitalize(priority) },
        { label: 'Tipo', value: KIND_LABEL[kind] }
      ],
      ops: [{ type: 'addTask', task }],
      doneText: 'Tarea agregada' + (due ? ' para el ' + longDate(due) : '') + '.'
    })
  };
}

function move(state: AppState, orig: string, n: string, today: string, now: Date): Reply {
  void now;
  const dates = findDates(n, today);
  const times = findTimes(n);
  const force = /\b(igual|de todos modos|aunque se cruce)\b/.test(n);
  const shiftM = /\b(\d+|una|un|media|dos|tres)\s*(hora|horas|minutos|min)\b/.exec(n);
  let source: string | undefined;
  let targetDate: string | undefined;
  let weekShift = false;
  if (dates.length >= 2) {
    source = dates[0].date;
    targetDate = dates[1].weekShift ? undefined : dates[1].date;
    weekShift = !!dates[1].weekShift;
  } else if (dates.length === 1) {
    const before = n.slice(Math.max(0, dates[0].start - 6), dates[0].start + 6);
    const isTarget = /\b(a|al|para|hasta)\s/.test(n.slice(dates[0].start, dates[0].start + 6)) || /\b(a|al|para|hasta)\s+$/.test(n.slice(Math.max(0, dates[0].start - 6), dates[0].start)) || dates[0].weekShift;
    void before;
    if (isTarget) {
      if (dates[0].weekShift) weekShift = true;
      else targetDate = dates[0].date;
    } else source = dates[0].date;
  }
  const spans: Span[] = [...dates, ...times, ...(shiftM ? [{ start: shiftM.index, end: shiftM.index + shiftM[0].length }] : [])];
  const { best, options } = findTarget(state, n, spans, today, source);
  if (!best) {
    const up = occurrences(state, today, addDays(today, 7)).slice(0, 3);
    return { text: 'No encontré esa actividad. ¿Te refieres a alguna de estas?', chips: up.map((o) => 'Mueve ' + o.title + ' ' + (o.date === today ? 'de hoy' : 'del ' + shortDate(o.date).split(' ').slice(1).join(' ')) + ' a mañana') };
  }
  const len = toMin(best.end) - toMin(best.start);
  let date = targetDate ?? (weekShift ? addDays(best.date, 7) : best.date);
  let start = times[0]?.start_ ?? best.start;
  if (shiftM && !times.length && !targetDate && !weekShift) {
    const q = NUM_WORDS[shiftM[1]] ?? Number(shiftM[1]);
    const delta = /min/.test(shiftM[2]) ? q : q * 60;
    start = fromMin(toMin(best.start) + (/adelanta/.test(n) ? -delta : delta));
  }
  if (date === best.date && start === best.start) {
    return { text: '¿A qué día u hora muevo «' + best.title + '»? Está el ' + longDate(best.date) + ' a las ' + best.start + '.', chips: ['Mueve ' + best.title + ' a mañana', 'Mueve ' + best.title + ' a la próxima semana'] };
  }
  let end = times[0]?.end_ ?? fromMin(toMin(start) + len);
  let warning: string | undefined;
  const clash = conflicts(state, date, start, end, [best.key]);
  if (clash.length && !force) {
    const alt = findSlot(state, date, len, { days: 3, notBefore: start, ignore: [best.key] });
    if (alt) {
      warning = 'A esa hora tienes ' + clash.map((c) => c.title).join(' y ') + '. Te propongo el siguiente hueco libre.';
      date = alt.date;
      start = alt.start;
      end = alt.end;
    } else warning = 'Se cruza con ' + clash.map((c) => c.title).join(' y ') + '.';
  }
  const ambiguous = options.length > 1 && options[1].title === best.title && options[1].date !== best.date;
  return {
    text: ambiguous ? 'Encontré varias; tomo la más próxima (' + relativeDate(best.date, today).toLowerCase() + '):' : 'Así quedaría el cambio:',
    proposal: proposal({
      tag: 'Mover actividad',
      title: best.title,
      rows: [
        { label: 'Antes', value: fmtRange(best, today) },
        { label: 'Después', value: fmtRange({ date, start, end }, today) }
      ],
      why: best.source !== 'actividad' ? 'es una ' + (best.source === 'clase' ? 'sesión de clase' : 'actividad automática') + '; solo cambio esta fecha, el resto del horario queda igual.' : undefined,
      warning,
      ops: opsForEdit(best, { date, start, end }),
      doneText: 'Hecho. «' + best.title + '» pasó al ' + longDate(date) + ' a las ' + start + '.'
    }),
    chips: warning && !force ? [orig + ' igual'] : undefined
  };
}

function remove(state: AppState, orig: string, n: string, today: string): Reply {
  void orig;
  const dates = findDates(n, today);
  const times = findTimes(n);
  const { best } = findTarget(state, n, [...dates, ...times], today, dates[0]?.date);
  if (!best) return { text: 'No encontré esa actividad en las próximas semanas. Dime el nombre como aparece en tu calendario.' };
  return {
    text: 'Esto es lo que eliminaría:',
    proposal: proposal({
      tag: 'Eliminar actividad',
      title: best.title,
      rows: [{ label: 'Cuándo', value: capitalize(longDate(best.date)) + ' · ' + best.start + ' – ' + best.end }],
      why: best.source === 'clase' ? 'solo se elimina esta sesión; la materia sigue en tu horario.' : undefined,
      ops: opsForDelete(best),
      doneText: 'Eliminada. Puedes deshacerlo desde el aviso de abajo.'
    })
  };
}

function reorganize(state: AppState, orig: string, n: string, today: string): Reply {
  const { dayStart, dayEnd } = state.settings;
  const dates = findDates(n, today);
  const times = findTimes(n);
  const part = findPartOfDay(n, dayStart, dayEnd);
  const date = dates[0]?.date ?? today;
  let from = part?.from ?? dayStart;
  let to = part?.to ?? dayEnd;
  if (times[0]) {
    from = times[0].start_;
    to = times[0].end_ ?? fromMin(toMin(from) + 120);
  }
  const label = /feriado/.test(n) ? 'Feriado' : /institucional/.test(n) ? 'Evento institucional' : /asamblea/.test(n) ? 'Asamblea' : /urgente/.test(n) ? 'Reunión urgente' : 'Imprevisto';
  const affected = occurrencesOn(state, date).filter((o) => toMin(o.start) < toMin(to) && toMin(from) < toMin(o.end) && o.kind !== 'plazo');
  const block = { id: uid('a'), title: label, kind: 'personal' as Kind, date, start: from, end: to, source: 'asistente' as const, notes: orig };
  const ops: Op[] = [{ type: 'add', activity: block }];
  const rows: { label: string; value: string }[] = [{ label: 'Bloqueo', value: capitalize(shortDate(date)) + ' · ' + from + ' – ' + to }];
  const planned: { date: string; start: string; end: string }[] = [{ date, start: from, end: to }];
  const unplaced: string[] = [];
  for (const o of affected) {
    const len = toMin(o.end) - toMin(o.start);
    const slot = findSlot(state, addDays(date, 1), len, { days: 7, ignore: affected.map((a) => a.key), extraBusy: planned });
    if (!slot) {
      unplaced.push(o.title);
      continue;
    }
    planned.push(slot);
    ops.push(...opsForEdit(o, { date: slot.date, start: slot.start, end: slot.end }));
    rows.push({ label: o.title, value: '→ ' + capitalize(shortDate(slot.date)) + ' · ' + slot.start });
  }
  if (!affected.length) {
    return {
      text: 'Ese horario no se cruza con nada de tu calendario. Puedo registrarlo como bloqueo:',
      proposal: proposal({ tag: 'Registrar imprevisto', title: label, rows, ops, doneText: 'Registré «' + label + '» el ' + longDate(date) + '.' })
    };
  }
  return {
    text: 'El ' + label.toLowerCase() + ' se cruza con ' + affected.length + (affected.length === 1 ? ' actividad' : ' actividades') + '. Te propongo este plan alternativo:',
    proposal: proposal({
      tag: 'Plan alternativo',
      title: 'Reorganizar ' + longDate(date),
      rows,
      why: 'busqué para cada actividad el primer hueco libre de la misma duración en los días siguientes, entre ' + dayStart + ' y ' + dayEnd + ', sin cruces ni feriados.',
      warning: unplaced.length ? 'No encontré hueco para: ' + unplaced.join(', ') + '. Quedarán en su horario original.' : undefined,
      ops,
      doneText: 'Plan aplicado. Actualicé ' + (ops.length - 1) + (ops.length - 1 === 1 ? ' actividad' : ' actividades') + ' y bloqueé el horario del imprevisto.'
    })
  };
}

export function pendingItems(state: AppState, today: string) {
  const deadline = nextGradesDeadline(state, today);
  const limit = deadline ? deadlineEnd(deadline) : addDays(today, 14);
  const uploaded = deadline ? state.gradesUploaded[deadline.id] ?? [] : [];
  const items: { label: string; value: string }[] = [];
  for (const t of state.tasks.filter((t) => !t.done && (!t.due || t.due <= limit)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))) {
    items.push({ label: t.title, value: t.due ? relativeDate(t.due, today) : 'Sin fecha' });
  }
  // Solo el próximo bloque de calificación de cada materia.
  const seen = new Set<string>();
  for (const o of occurrences(state, today, limit).filter((o) => o.source === 'bloque' && /^Calificar/.test(o.title))) {
    if (seen.has(o.courseId ?? o.title)) continue;
    seen.add(o.courseId ?? o.title);
    items.push({ label: o.title, value: relativeDate(o.date, today) + ' ' + o.start });
  }
  const taskText = state.tasks.filter((t) => !t.done).map((t) => norm(t.title)).join(' | ');
  if (deadline)
    for (const c of state.courses.filter((c) => !uploaded.includes(c.id))) {
      const subj = norm(c.subject);
      if (taskText.includes('subir notas') && taskText.split(' | ').some((t) => t.includes('subir notas') && t.includes(subj))) continue;
      items.push({ label: 'Subir notas · ' + courseName(c), value: shortDate(deadlineEnd(deadline)) });
    }
  return { deadline, items };
}

function pending(state: AppState, today: string): Reply {
  const { deadline, items } = pendingItems(state, today);
  if (!items.length) return { text: deadline ? 'No tienes pendientes antes de que venza «' + deadline.title + '» el ' + longDate(deadlineEnd(deadline)) + '. Buen trabajo.' : 'No tienes tareas pendientes en las próximas dos semanas.' };
  const end = deadline ? deadlineEnd(deadline) : today;
  const days = deadline ? Math.max(0, Math.round((fromISO(end).getTime() - fromISO(today).getTime()) / 86400000)) : 0;
  return {
    text: deadline
      ? 'Antes de que venza «' + deadline.title + '» (' + longDate(end) + (days ? ', en ' + days + (days === 1 ? ' día' : ' días') : ', hoy') + ') te falta:'
      : 'Esto es lo que tienes pendiente en las próximas dos semanas:',
    list: items.slice(0, 10)
  };
}

function free(state: AppState, n: string, today: string, dayStart: string, dayEnd: string): Reply {
  void dayStart;
  void dayEnd;
  if (/\bsemana\b/.test(n)) {
    const ws = /proxima|siguiente|que viene/.test(n) ? addDays(startOfWeek(today), 7) : startOfWeek(today);
    const list: { label: string; value: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(ws, i);
      if (d < today) continue;
      const w = freeWindows(state, d, 60);
      list.push({ label: capitalize(shortDate(d)), value: w.length ? w.map((x) => x.start + '–' + x.end).join(', ') : 'Sin huecos de 1 h' });
    }
    return { text: 'Tus huecos libres de al menos una hora:', list };
  }
  const date = findDates(n, today)[0]?.date ?? today;
  const w = freeWindows(state, date, 30);
  if (!w.length) return { text: 'El ' + longDate(date) + ' no tienes huecos libres entre ' + state.settings.dayStart + ' y ' + state.settings.dayEnd + '.' };
  return { text: 'Libre el ' + longDate(date) + ':', list: w.map((x) => ({ label: x.start + ' – ' + x.end, value: durationLabel(x.start, x.end) })) };
}

export function daySummaryData(state: AppState, date: string) {
  const occs = occurrencesOn(state, date);
  const total = totalMinutes(occs);
  const academic = academicOn(state, date);
  return { occs, total, academic, overload: total > OVERLOAD_MIN };
}

function daySummary(state: AppState, date: string, today: string): Reply {
  const { occs, total, academic, overload } = daySummaryData(state, date);
  const label = date === today ? 'Tu día de hoy' : date === addDays(today, 1) ? 'Mañana' : capitalize(longDate(date));
  if (!occs.length && !academic.length) return { text: label + ': no tienes actividades registradas.' };
  const list = occs.map((o) => ({ label: o.title, value: o.start + ' – ' + o.end }));
  for (const a of academic) list.unshift({ label: a.title, value: 'ESPOCH' });
  let text = label + ': ' + occs.length + (occs.length === 1 ? ' actividad' : ' actividades') + ' y ' + hoursLabel(total) + ' de carga.';
  if (overload) text += ' Es un día cargado; si quieres, pídeme mover algo.';
  return { text, list };
}

function weekSummary(state: AppState, n: string, today: string): Reply {
  const ws = /proxima|siguiente|que viene/.test(n) ? addDays(startOfWeek(today), 7) : startOfWeek(today);
  const we = addDays(ws, 6);
  const occs = occurrences(state, ws, we);
  const mins = minutesByKind(occs);
  const list = KIND_ORDER.filter((k) => mins[k] > 0).map((k) => ({ label: KIND_LABEL[k], value: hoursLabel(mins[k]) }));
  const byDay = [0, 1, 2, 3, 4].map((i) => {
    const d = addDays(ws, i);
    return { d, m: totalMinutes(occs.filter((o) => o.date === d)) };
  });
  const busiest = byDay.reduce((a, b) => (b.m > a.m ? b : a), byDay[0]);
  const lightest = byDay.reduce((a, b) => (b.m < a.m ? b : a), byDay[0]);
  const deadlines = (state.calendar?.fechas ?? []).filter((f) => f.date >= ws && f.date <= we && (f.type === 'notas' || f.type === 'examen' || f.type === 'feriado'));
  for (const f of deadlines) list.push({ label: f.title, value: capitalize(shortDate(f.date)) });
  const overloaded = byDay.filter((x) => x.m > OVERLOAD_MIN);
  return {
    text:
      'Semana del ' + shortDate(ws) + ' al ' + shortDate(addDays(ws, 4)) + ': ' + hoursLabel(totalMinutes(occs)) + ' en total. ' +
      (busiest.m ? 'El día más cargado es el ' + longDate(busiest.d).split(' ')[0] + ' (' + hoursLabel(busiest.m) + ') y el más libre el ' + longDate(lightest.d).split(' ')[0] + '.' : '') +
      (overloaded.length ? ' Atención: ' + overloaded.map((x) => longDate(x.d).split(' ')[0]).join(' y ') + ' superan las 8 h.' : ''),
    list
  };
}

/** Saludo inicial del chat. */
export function greeting(state: AppState): Reply {
  const name = state.settings.name ? ', ' + state.settings.name.replace(/^(dra?|ing|msc|mgs|phd|lic)\.?\s+/i, '').split(' ')[0] : '';
  return {
    text: 'Hola' + name + '. Soy tu asistente de DocenTime (modo demo, sin conexión a IA). Puedo crear, mover o eliminar actividades y avisarte de plazos. Siempre te muestro una vista previa antes de cambiar algo.',
    chips: SUGGESTIONS
  };
}
