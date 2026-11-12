// Exportación e importación de calendarios .ics (Google Calendar, Outlook, Calendario de iOS).
import type { Activity, AppState, Kind } from './types';
import { addDays, toISO, todayISO, uid } from './dates';
import { occurrences, semesterRange } from './schedule';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function dt(date: string, time: string): string {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function wrap(events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DocenTime//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:DocenTime', ...events, 'END:VCALENDAR'].join('\r\n');
}

export function vevent(e: { uid: string; title: string; date: string; start: string; end: string; location?: string; description?: string }): string {
  return [
    'BEGIN:VEVENT',
    'UID:' + e.uid + '@docentime',
    'DTSTAMP:' + stamp(),
    'DTSTART:' + dt(e.date, e.start),
    'DTEND:' + dt(e.date, e.end),
    'SUMMARY:' + esc(e.title),
    e.location ? 'LOCATION:' + esc(e.location) : '',
    e.description ? 'DESCRIPTION:' + esc(e.description) : '',
    'END:VEVENT'
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function exportICS(state: AppState): string {
  const sem = semesterRange(state);
  const from = todayISO() > sem.from ? addDays(todayISO(), -7) : sem.from;
  const to = sem.to > addDays(from, 30) ? sem.to : addDays(from, 120);
  const events = occurrences(state, from, to).map((o) => vevent({ uid: o.key.replace(/[:]/g, '-'), title: o.title, date: o.date, start: o.start, end: o.end, location: o.location }));
  for (const f of state.calendar?.fechas ?? []) {
    events.push(
      ['BEGIN:VEVENT', 'UID:espoch-' + f.id + '@docentime', 'DTSTAMP:' + stamp(), 'DTSTART;VALUE=DATE:' + f.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(f.endDate ?? f.date, 1).replace(/-/g, ''), 'SUMMARY:' + esc('ESPOCH · ' + f.title), 'END:VEVENT'].join('\r\n')
    );
  }
  return wrap(events);
}

export function singleEventICS(e: { title: string; date: string; start: string; end: string; location?: string; description?: string }): string {
  return wrap([vevent({ uid: uid('inv'), ...e })]);
}

/** Lee eventos con hora de un archivo .ics. Los eventos de día completo se omiten. */
export function parseICS(text: string, kind: Kind = 'personal'): Activity[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: Activity[] = [];
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const get = (k: string) => {
      const m = new RegExp('^' + k + '(?:;[^:]*)?:(.*)$', 'm').exec(b);
      return m ? m[1].trim() : undefined;
    };
    const s = get('DTSTART');
    const e = get('DTEND');
    const title = (get('SUMMARY') ?? 'Evento').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
    if (!s || !/T\d{4}/.test(s)) continue;
    const toLocal = (v: string) => {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(v)!;
      const d = v.endsWith('Z')
        ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
        : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      return { date: toISO(d), time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') };
    };
    const a = toLocal(s);
    const z = e && /T\d{4}/.test(e) ? toLocal(e) : { date: a.date, time: String(Math.min(23, +a.time.slice(0, 2) + 1)).padStart(2, '0') + a.time.slice(2) };
    out.push({ id: uid('a'), title, kind, date: a.date, start: a.time, end: z.date === a.date ? z.time : '23:59', location: get('LOCATION')?.replace(/\\,/g, ','), source: 'ics' });
  }
  return out;
}

/** Descarga o comparte un archivo de texto. */
export async function shareFile(name: string, content: string, mime: string): Promise<'compartido' | 'descargado'> {
  const file = new File([content], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      return 'compartido';
    } catch {
      /* el usuario canceló: se descarga */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'descargado';
}
