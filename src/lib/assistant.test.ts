import { describe, expect, it } from 'vitest';
import { findDates, findTimes, norm, reply } from './assistant';
import { applyOps, emptyState } from './store';
import { demoState } from './demo';
import { occurrencesOn } from './schedule';
import type { AcademicCalendar, AppState } from './types';
import calendar from '../../public/espoch-calendario.json';

// Miércoles 11 de noviembre de 2026, 08:30
const NOW = new Date(2026, 10, 11, 8, 30);
const TODAY = '2026-11-11';

function state(): AppState {
  const base = { ...emptyState(), calendar: calendar as AcademicCalendar };
  return demoState(base, TODAY);
}

describe('normalización', () => {
  it('conserva la longitud', () => {
    const s = '¿Mueve la revisión de tesis de Pedro a mañana?';
    expect(norm(s).length).toBe(s.length);
    expect(norm(s)).toContain('revision');
  });
});

describe('fechas', () => {
  it('días de la semana', () => {
    expect(findDates(norm('el jueves'), TODAY)[0].date).toBe('2026-11-12');
    expect(findDates(norm('el miércoles'), TODAY)[0].date).toBe('2026-11-11');
    expect(findDates(norm('el próximo miércoles'), TODAY)[0].date).toBe('2026-11-18');
    expect(findDates(norm('el lunes de la próxima semana'), TODAY)[0].date).toBe('2026-11-16');
  });
  it('relativas y numéricas', () => {
    expect(findDates(norm('mañana'), TODAY)[0].date).toBe('2026-11-12');
    expect(findDates(norm('en la mañana'), TODAY)).toHaveLength(0);
    expect(findDates(norm('pasado mañana'), TODAY)[0].date).toBe('2026-11-13');
    expect(findDates(norm('el 20 de noviembre'), TODAY)[0].date).toBe('2026-11-20');
    expect(findDates(norm('el 25/11'), TODAY)[0].date).toBe('2026-11-25');
    expect(findDates(norm('a la próxima semana'), TODAY)[0].weekShift).toBe(true);
  });
});

describe('horas', () => {
  it('formatos comunes', () => {
    expect(findTimes(norm('a las 10'))[0].start_).toBe('10:00');
    expect(findTimes(norm('a las 3'))[0].start_).toBe('15:00');
    expect(findTimes(norm('a las 9 de la mañana'))[0].start_).toBe('09:00');
    expect(findTimes(norm('a las 10:30'))[0].start_).toBe('10:30');
    expect(findTimes(norm('4 pm'))[0].start_).toBe('16:00');
    const r = findTimes(norm('de 10 a 12'))[0];
    expect([r.start_, r.end_]).toEqual(['10:00', '12:00']);
  });
});

describe('asistente', () => {
  it('crea una reunión con vista previa', () => {
    const s = state();
    const r = reply(s, 'Agrega una reunión del proyecto de vinculación el jueves a las 10', NOW);
    expect(r.proposal?.tag).toBe('Nueva actividad');
    const op = r.proposal!.ops[0];
    expect(op.type).toBe('add');
    if (op.type === 'add') {
      expect(op.activity.date).toBe('2026-11-12');
      expect(op.activity.kind).toBe('proyecto');
      expect(op.activity.projectId).toBe('p-vin');
      expect(op.activity.title.toLowerCase()).toContain('reunión del proyecto de vinculación');
    }
  });

  it('mueve la revisión de tesis de Pedro una semana', () => {
    const s = state();
    const r = reply(s, 'Mueve la revisión de tesis de Pedro a la próxima semana', NOW);
    expect(r.proposal?.tag).toBe('Mover actividad');
    expect(r.proposal?.title).toContain('Pedro');
    const after = applyOps(s, r.proposal!.ops);
    expect(occurrencesOn(after, '2026-11-11').some((o) => o.title.includes('Pedro'))).toBe(false);
    expect(occurrencesOn(after, '2026-11-18').filter((o) => o.title.includes('Pedro')).length).toBeGreaterThan(0);
  });

  it('elimina una actividad', () => {
    const s = state();
    const r = reply(s, 'Cancela la cita médica', NOW);
    expect(r.proposal?.tag).toBe('Eliminar actividad');
    const after = applyOps(s, r.proposal!.ops);
    expect(after.activities.some((a) => a.title === 'Cita médica')).toBe(false);
  });

  it('reorganiza por un imprevisto', () => {
    const s = state();
    const r = reply(s, 'Surgió un evento institucional el jueves en la mañana', NOW);
    expect(r.proposal?.tag).toBe('Plan alternativo');
    const after = applyOps(s, r.proposal!.ops);
    const thu = occurrencesOn(after, '2026-11-12');
    expect(thu.some((o) => o.title === 'Evento institucional')).toBe(true);
    expect(thu.filter((o) => o.kind === 'clase' && o.start < '13:00' && o.source !== 'bloque').length).toBe(0);
  });

  it('lista pendientes antes de subir notas', () => {
    const r = reply(state(), '¿Qué tengo pendiente antes de subir notas?', NOW);
    expect(r.list?.length).toBeGreaterThan(0);
    expect(r.text).toContain('Parcial 1');
  });

  it('crea tareas', () => {
    const r = reply(state(), 'Agrega una tarea: revisar el sílabo para el viernes', NOW);
    expect(r.proposal?.tag).toBe('Nueva tarea');
    const op = r.proposal!.ops[0];
    if (op.type === 'addTask') expect(op.task.due).toBe('2026-11-13');
  });

  it('responde huecos libres y resúmenes', () => {
    expect(reply(state(), '¿Cuándo tengo libre mañana?', NOW).list?.length).toBeGreaterThan(0);
    expect(reply(state(), 'Resumen semanal', NOW).list?.length).toBeGreaterThan(0);
    expect(reply(state(), 'resumen de hoy', NOW).text).toContain('Tu día de hoy');
  });

  it('pide ayuda ante pedidos desconocidos', () => {
    expect(reply(state(), 'cuéntame un chiste', NOW).text).toContain('modo demo');
  });
});
