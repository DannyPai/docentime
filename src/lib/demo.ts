// Datos de ejemplo relativos a la semana actual, para explorar la app sin cargar nada.
import type { Activity, AppState, Course, Project, Task, Thesis } from './types';
import { addDays, startOfWeek, todayISO, uid } from './dates';
import { deadlineEnd, nextGradesDeadline } from './schedule';

export function demoState(base: AppState, today: string = todayISO()): AppState {
  const W = startOfWeek(today);
  const d = (n: number) => addDays(W, n);

  const bd: Course = {
    id: 'c-bd',
    subject: 'Bases de Datos',
    parallel: 'A',
    room: 'FIE-204',
    slots: [
      { weekday: 1, start: '07:00', end: '09:00' },
      { weekday: 3, start: '07:00', end: '09:00' },
      { weekday: 4, start: '11:00', end: '13:00' }
    ],
    prepBlocks: true,
    gradingBlocks: true
  };
  const isw: Course = {
    id: 'c-isw',
    subject: 'Ingeniería de Software II',
    parallel: 'B',
    room: 'Lab. 3',
    slots: [
      { weekday: 1, start: '11:00', end: '13:00' },
      { weekday: 2, start: '07:00', end: '09:00' },
      { weekday: 3, start: '15:00', end: '17:00' },
      { weekday: 4, start: '07:00', end: '09:00' }
    ],
    prepBlocks: true,
    gradingBlocks: false
  };

  const vin: Project = {
    id: 'p-vin',
    name: 'Alfabetización digital rural',
    type: 'vinculacion',
    role: 'Coordinadora',
    members: [
      { id: 'm1', name: 'Carlos Vaca', busy: [], demo: true },
      { id: 'm2', name: 'María Tapia', busy: [], demo: true },
      { id: 'm3', name: 'José Silva', busy: [], demo: true }
    ],
    milestones: [
      { id: uid('h'), title: 'Diagnóstico en comunidades', date: d(-21), done: true },
      { id: uid('h'), title: 'Talleres módulo 1', date: d(-7), done: true },
      { id: uid('h'), title: 'Informe de avance', date: d(9), done: false },
      { id: uid('h'), title: 'Talleres módulo 2', date: d(23), done: false },
      { id: uid('h'), title: 'Informe final', date: d(60), done: false }
    ]
  };
  const inv: Project = {
    id: 'p-inv',
    name: 'Analítica de aprendizaje en aulas virtuales',
    type: 'investigacion',
    role: 'Investigadora',
    members: [{ id: 'm4', name: 'María Tapia', busy: [], demo: true }],
    milestones: [
      { id: uid('h'), title: 'Revisión de literatura', date: d(-14), done: true },
      { id: uid('h'), title: 'Entregable 2: dataset', date: d(23), done: false },
      { id: uid('h'), title: 'Artículo para congreso', date: d(70), done: false }
    ]
  };
  const com: Project = {
    id: 'p-com',
    name: 'Comisión de Carrera · Software',
    type: 'comision',
    role: 'Miembro',
    members: [
      { id: 'm5', name: 'Rosa Paredes', busy: [], demo: true },
      { id: 'm6', name: 'Diego Cárdenas', busy: [], demo: true }
    ],
    milestones: [{ id: uid('h'), title: 'Actualización del sílabo', date: d(16), done: false }]
  };

  const act = (o: Omit<Activity, 'id' | 'source'>): Activity => ({ id: uid('a'), source: 'manual', ...o });
  const activities: Activity[] = [
    act({ title: 'Comisión de Titulación', kind: 'titulacion', date: d(0), start: '15:00', end: '16:00', location: 'Sala de docentes' }),
    act({ title: 'Proyecto de Investigación · revisión de avance', kind: 'proyecto', date: d(1), start: '10:00', end: '12:00', projectId: 'p-inv' }),
    act({ title: 'Comisión de Carrera', kind: 'comision', date: d(2), start: '10:00', end: '11:00', location: 'Sala de docentes', projectId: 'p-com' }),
    act({ title: 'Revisión de tesis · Pedro Guamán', kind: 'titulacion', date: d(2), start: '11:00', end: '12:00', location: 'Oficina 12' }),
    act({ title: 'Tutoría de tesis · Ana Morocho', kind: 'titulacion', date: d(3), start: '15:00', end: '16:00', location: 'Oficina 12' }),
    act({ title: 'Reunión de planificación · Vinculación', kind: 'proyecto', date: d(4), start: '09:00', end: '10:00', projectId: 'p-vin' }),
    act({ title: 'Cita médica', kind: 'personal', date: d(4), start: '14:00', end: '15:00' }),
    act({ title: 'Comisión de Carrera', kind: 'comision', date: d(9), start: '10:00', end: '11:00', location: 'Sala de docentes', projectId: 'p-com' }),
    act({ title: 'Revisión de tesis · Pedro Guamán', kind: 'titulacion', date: d(16), start: '11:00', end: '12:00', location: 'Oficina 12' })
  ];

  const draft = { ...base, courses: [bd, isw] } as AppState;
  const notas = nextGradesDeadline(draft, today);
  const task = (o: Partial<Task> & { title: string }): Task => ({ id: uid('k'), kind: 'personal', priority: 'media', done: false, subtasks: [], createdAt: new Date().toISOString(), ...o });
  const tasks: Task[] = [
    task({ title: 'Calificar lección 2 · Bases de Datos', kind: 'clase', due: today, priority: 'alta' }),
    task({ title: 'Subir notas · Bases de Datos A', kind: 'clase', due: notas ? deadlineEnd(notas) : d(4), priority: 'alta' }),
    task({ title: 'Revisar capítulo 2 · tesis de Pedro', kind: 'titulacion', due: d(2) }),
    task({
      title: 'Informe de avance de vinculación',
      kind: 'proyecto',
      due: d(9),
      projectId: 'p-vin',
      subtasks: [
        { id: uid('s'), title: 'Consolidar asistencia a talleres', done: true },
        { id: uid('s'), title: 'Redactar resultados', done: false },
        { id: uid('s'), title: 'Anexar fotografías', done: false }
      ]
    })
  ];

  const theses: Thesis[] = [
    {
      id: 't1',
      student: 'Pedro Guamán',
      topic: 'Sistema de trazabilidad para cooperativas agrícolas',
      stage: 1,
      lastReview: addDays(today, -14),
      nextMeeting: d(2) + 'T11:00',
      role: 'tutor',
      checklist: [
        { id: uid('s'), title: 'Corregir marco teórico', done: true },
        { id: uid('s'), title: 'Diagrama de arquitectura', done: true },
        { id: uid('s'), title: 'Casos de uso actualizados', done: false },
        { id: uid('s'), title: 'Referencias en formato APA', done: false }
      ]
    },
    {
      id: 't2',
      student: 'Ana Morocho',
      topic: 'App móvil para control de asistencia',
      stage: 2,
      lastReview: addDays(today, -7),
      nextMeeting: d(3) + 'T15:00',
      role: 'tutor',
      checklist: [
        { id: uid('s'), title: 'Documento completo', done: true },
        { id: uid('s'), title: 'Resumen y abstract', done: false }
      ]
    },
    { id: 't3', student: 'Luis Cando', topic: 'Detección de plagas con visión artificial', stage: 3, nextMeeting: d(15) + 'T10:00', role: 'tribunal', checklist: [] }
  ];

  return {
    ...base,
    settings: {
      ...base.settings,
      name: base.settings.name || 'Dra. Lucía Andrade',
      faculty: base.settings.faculty || 'Informática y Electrónica',
      career: base.settings.career || 'Software',
      designations: ['clase', 'comision', 'proyecto', 'titulacion']
    },
    courses: [bd, isw],
    activities,
    dismissed: [],
    tasks,
    projects: [vin, inv, com],
    theses,
    invitations: [
      { id: uid('i'), projectId: 'p-vin', title: 'Reunión de seguimiento · Vinculación', from: 'Carlos Vaca', date: d(4), start: '12:00', end: '13:00', location: 'Sala de docentes FIE', status: 'pendiente' }
    ],
    gradesUploaded: notas ? { [notas.id]: [] } : {},
    chat: []
  };
}
