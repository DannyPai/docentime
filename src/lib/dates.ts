// Utilidades de fecha en hora local. Las fechas se guardan como 'YYYY-MM-DD' y las horas como 'HH:MM'.

export const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad = (n: number) => (n < 10 ? '0' : '') + n;

export function toISO(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 1 = lunes … 7 = domingo */
export function weekday(iso: string): number {
  const w = fromISO(iso).getDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - weekday(iso));
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMin(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

export function durationLabel(start: string, end: string): string {
  const d = toMin(end) - toMin(start);
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (!h) return m + ' min';
  return m ? h + ' h ' + m + ' min' : h + ' h';
}

export function hoursLabel(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return String(h).replace('.', ',') + ' h';
}

/** "mié 11 nov" */
export function shortDate(iso: string): string {
  const d = fromISO(iso);
  return DAYS_SHORT[weekday(iso) - 1].toLowerCase() + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

/** "miércoles 11 de noviembre" */
export function longDate(iso: string): string {
  const d = fromISO(iso);
  return DAYS_LONG[weekday(iso) - 1] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
}

/** "Hoy", "Mañana", "Ayer" o "mié 11 nov" */
export function relativeDate(iso: string, today: string = todayISO()): string {
  const d = diffDays(today, iso);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  return shortDate(iso);
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);
}

export function inRange(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to;
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function nowTime(now: Date = new Date()): string {
  return pad(now.getHours()) + ':' + pad(now.getMinutes());
}
