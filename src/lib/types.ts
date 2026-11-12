// Modelo de datos de DocenTime. Todo se guarda en el dispositivo (localStorage).

/** Tipo de actividad: define el color y la designación a la que pertenece. */
export type Kind = 'clase' | 'comision' | 'proyecto' | 'titulacion' | 'personal' | 'plazo';

export interface ClassSlot {
  /** 1 = lunes … 7 = domingo */
  weekday: number;
  start: string; // 'HH:MM'
  end: string;
}

export interface Course {
  id: string;
  subject: string;
  parallel: string;
  room: string;
  slots: ClassSlot[];
  /** Genera un bloque semanal de preparación antes de la primera clase de la semana. */
  prepBlocks: boolean;
  /** Genera un bloque semanal de calificación después de la última clase de la semana. */
  gradingBlocks: boolean;
}

export interface Activity {
  id: string;
  title: string;
  kind: Kind;
  date: string; // 'YYYY-MM-DD'
  start: string;
  end: string;
  location?: string;
  notes?: string;
  projectId?: string;
  /** Clave de la ocurrencia generada (clase o bloque) que esta actividad reemplaza al editarla. */
  replaces?: string;
  source?: 'manual' | 'asistente' | 'rapido' | 'ics' | 'invitacion';
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  kind: Kind;
  due?: string; // fecha límite 'YYYY-MM-DD'
  priority: 'alta' | 'media' | 'baja';
  done: boolean;
  subtasks: Subtask[];
  projectId?: string;
  createdAt: string;
}

export type AcademicType = 'inicio' | 'fin' | 'parcial' | 'examen' | 'feriado' | 'notas' | 'otro';

export interface AcademicDate {
  id: string;
  title: string;
  type: AcademicType;
  date: string;
  endDate?: string;
}

export interface AcademicCalendar {
  periodo: string;
  actualizado: string;
  esEjemplo?: boolean;
  fechas: AcademicDate[];
}

export interface BusyBlock {
  date: string;
  start: string;
  end: string;
}

export interface Member {
  id: string;
  name: string;
  /** Bloques ocupados importados (solo ocupado/libre, sin detalle). */
  busy: BusyBlock[];
  busyUpdatedAt?: string;
  /** Miembro de ejemplo con disponibilidad simulada. */
  demo?: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  done: boolean;
}

export type ProjectType = 'vinculacion' | 'investigacion' | 'comision' | 'titulacion' | 'otro';

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  role: string;
  members: Member[];
  milestones: Milestone[];
}

export interface Invitation {
  id: string;
  projectId?: string;
  title: string;
  from: string;
  date: string;
  start: string;
  end: string;
  location?: string;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'reprogramada';
  proposal?: { date: string; start: string; end: string };
}

export interface Thesis {
  id: string;
  student: string;
  topic: string;
  /** 0 Anteproyecto · 1 Desarrollo · 2 Revisión final · 3 Defensa */
  stage: number;
  lastReview?: string;
  nextMeeting?: string; // 'YYYY-MM-DDTHH:MM'
  checklist: Subtask[];
  role: 'tutor' | 'tribunal';
}

export interface Settings {
  name: string;
  email: string;
  faculty: string;
  career: string;
  designations: Kind[];
  customDesignations: { id: string; name: string; color: string }[];
  theme: 'sistema' | 'claro' | 'oscuro';
  dnd: boolean;
  quietFrom: string;
  quietTo: string;
  /** Avisos antes de un vencimiento, en horas. */
  reminders: number[];
  dayStart: string;
  dayEnd: string;
  preferredGradingHour: string;
  onboarded: boolean;
  espochConnected: boolean;
  espochSyncedAt?: string;
}

export interface Notice {
  id: string;
  kind: 'cambio-espoch' | 'proyecto' | 'sistema';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export type Op =
  | { type: 'add'; activity: Activity }
  | { type: 'update'; id: string; patch: Partial<Activity> }
  | { type: 'remove'; id: string }
  | { type: 'dismiss'; key: string }
  | { type: 'addTask'; task: Task };

export interface Proposal {
  tag: string;
  title: string;
  rows: { label: string; value: string }[];
  why?: string;
  warning?: string;
  ops: Op[];
  doneText: string;
  status: 'pendiente' | 'aplicada' | 'cancelada';
}

export interface ChatMessage {
  id: string;
  from: 'docente' | 'asistente';
  text: string;
  list?: { label: string; value: string }[];
  proposal?: Proposal;
  chips?: string[];
  at: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  courses: Course[];
  activities: Activity[];
  dismissed: string[];
  tasks: Task[];
  calendar: AcademicCalendar | null;
  gradesUploaded: Record<string, string[]>;
  projects: Project[];
  invitations: Invitation[];
  theses: Thesis[];
  notices: Notice[];
  chat: ChatMessage[];
}

/** Ocurrencia concreta en el calendario: actividad, sesión de clase o bloque generado. */
export interface Occ {
  key: string;
  title: string;
  sub?: string;
  kind: Kind;
  date: string;
  start: string;
  end: string;
  location?: string;
  source: 'actividad' | 'clase' | 'bloque';
  activityId?: string;
  courseId?: string;
  projectId?: string;
}
