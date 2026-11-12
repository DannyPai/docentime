// Estado global con persistencia local y deshacer. Sin dependencias externas.
import { useSyncExternalStore } from 'react';
import type { AcademicCalendar, Activity, AppState, ChatMessage, Course, Invitation, Member, Milestone, Notice, Occ, Op, Project, Settings, Task, Thesis } from './types';
import { longDate, uid } from './dates';

const KEY = 'docentime:v1';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  email: '',
  faculty: '',
  career: '',
  designations: ['clase'],
  customDesignations: [],
  theme: 'sistema',
  dnd: false,
  quietFrom: '21:00',
  quietTo: '06:00',
  reminders: [168, 72, 24],
  dayStart: '07:00',
  dayEnd: '19:00',
  preferredGradingHour: '13:00',
  onboarded: false,
  espochConnected: false
};

export function emptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    courses: [],
    activities: [],
    dismissed: [],
    tasks: [],
    calendar: null,
    gradesUploaded: {},
    projects: [],
    invitations: [],
    theses: [],
    notices: [],
    chat: []
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    const base = emptyState();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return emptyState();
  }
}

let state: AppState = typeof localStorage === 'undefined' ? emptyState() : load();
const listeners = new Set<() => void>();
const undoStack: AppState[] = [];
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  if (typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento lleno o bloqueado: la app sigue funcionando en memoria */
    }
  }, 150);
}

export function getState(): AppState {
  return state;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(fn: (s: AppState) => AppState, opts: { undoable?: boolean } = {}) {
  const prev = state;
  state = fn(state);
  if (opts.undoable) {
    undoStack.push(prev);
    if (undoStack.length > 20) undoStack.shift();
  }
  persist();
  listeners.forEach((l) => l());
}

export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  state = { ...prev, chat: state.chat };
  persist();
  listeners.forEach((l) => l());
  return true;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------- Avisos breves (toasts) ----------
export interface Toast {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
export function toast(text: string, action?: Toast['action']) {
  const t = { id: uid('t'), text, action };
  toasts = [...toasts.slice(-2), t];
  toastListeners.forEach((l) => l());
  setTimeout(() => dismissToast(t.id), action ? 6000 : 3200);
}
export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((l) => l());
}
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toasts,
    () => toasts
  );
}
/** Aviso con botón "Deshacer" para el último cambio deshacible. */
export function toastUndo(text: string) {
  toast(text, { label: 'Deshacer', run: () => undo() && toast('Cambio deshecho') });
}

// ---------- Operaciones sobre actividades ----------
export function applyOps(s: AppState, ops: Op[]): AppState {
  let activities = s.activities;
  let dismissed = s.dismissed;
  let tasks = s.tasks;
  for (const op of ops) {
    if (op.type === 'addTask') tasks = [...tasks, op.task];
    else if (op.type === 'add') activities = [...activities, op.activity];
    else if (op.type === 'update') activities = activities.map((a) => (a.id === op.id ? { ...a, ...op.patch } : a));
    else if (op.type === 'remove') activities = activities.filter((a) => a.id !== op.id);
    else if (op.type === 'dismiss') dismissed = dismissed.includes(op.key) ? dismissed : [...dismissed, op.key];
  }
  return { ...s, activities, dismissed, tasks };
}

export function runOps(ops: Op[]) {
  setState((s) => applyOps(s, ops), { undoable: true });
}

/** Operaciones para cambiar una ocurrencia (actividad o clase/bloque generado). */
export function opsForEdit(occ: Occ, patch: Partial<Activity>): Op[] {
  if (occ.activityId) return [{ type: 'update', id: occ.activityId, patch }];
  const activity: Activity = {
    id: uid('a'),
    title: occ.title,
    kind: occ.kind,
    date: occ.date,
    start: occ.start,
    end: occ.end,
    location: occ.location,
    replaces: occ.key,
    source: 'manual',
    ...patch
  };
  return [{ type: 'add', activity }];
}

export function opsForDelete(occ: Occ): Op[] {
  return occ.activityId ? [{ type: 'remove', id: occ.activityId }] : [{ type: 'dismiss', key: occ.key }];
}

export function addActivity(a: Omit<Activity, 'id'>): Activity {
  const activity = { ...a, id: uid('a') };
  runOps([{ type: 'add', activity }]);
  return activity;
}

// ---------- Ajustes ----------
export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

// ---------- Tareas ----------
export function saveTask(t: Partial<Task> & { title: string }) {
  setState(
    (s) => {
      if (t.id && s.tasks.some((x) => x.id === t.id)) return { ...s, tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, ...t } : x)) };
      const task: Task = { id: uid('k'), kind: 'personal', priority: 'media', done: false, subtasks: [], createdAt: new Date().toISOString(), ...t };
      return { ...s, tasks: [...s.tasks, task] };
    },
    { undoable: true }
  );
}
export function toggleTask(id: string) {
  setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
}
export function toggleSubtask(taskId: string, subId: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.map((x) => (x.id === subId ? { ...x, done: !x.done } : x)) } : t))
  }));
}
export function removeTask(id: string) {
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }), { undoable: true });
}

// ---------- Materias ----------
export function saveCourse(c: Course) {
  setState((s) => ({ ...s, courses: s.courses.some((x) => x.id === c.id) ? s.courses.map((x) => (x.id === c.id ? c : x)) : [...s.courses, c] }), { undoable: true });
}
export function removeCourse(id: string) {
  setState((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id) }), { undoable: true });
}

// ---------- Calendario ESPOCH ----------
function calendarDiff(prev: AcademicCalendar | null, next: AcademicCalendar): string[] {
  if (!prev) return [];
  const changes: string[] = [];
  const old = new Map(prev.fechas.map((f) => [f.id, f]));
  for (const f of next.fechas) {
    const o = old.get(f.id);
    if (!o) changes.push('Nueva fecha: ' + f.title + ' (' + longDate(f.date) + ')');
    else if (o.date !== f.date || (o.endDate ?? '') !== (f.endDate ?? '')) changes.push(f.title + ': ahora ' + longDate(f.date));
    old.delete(f.id);
  }
  for (const f of old.values()) changes.push('Se retiró: ' + f.title);
  return changes;
}

export function setCalendar(cal: AcademicCalendar): string[] {
  const changes = calendarDiff(state.calendar, cal);
  setState((s) => {
    const notices: Notice[] = changes.length
      ? [
          {
            id: uid('n'),
            kind: 'cambio-espoch',
            title: changes.length === 1 ? 'Cambio en el calendario ESPOCH' : changes.length + ' cambios en el calendario ESPOCH',
            body: changes.join(' · '),
            createdAt: new Date().toISOString(),
            read: false
          },
          ...s.notices
        ]
      : s.notices;
    return { ...s, calendar: cal, notices, settings: { ...s.settings, espochConnected: true, espochSyncedAt: new Date().toISOString() } };
  });
  return changes;
}

export async function syncEspoch(): Promise<{ ok: boolean; changes: string[]; error?: string }> {
  try {
    const res = await fetch('./espoch-calendario.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const cal = (await res.json()) as AcademicCalendar;
    if (!cal || !Array.isArray(cal.fechas)) throw new Error('Formato no válido');
    return { ok: true, changes: setCalendar(cal) };
  } catch (e) {
    return { ok: false, changes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function toggleGradesUploaded(deadlineId: string, courseId: string) {
  setState((s) => {
    const cur = s.gradesUploaded[deadlineId] ?? [];
    const next = cur.includes(courseId) ? cur.filter((c) => c !== courseId) : [...cur, courseId];
    return { ...s, gradesUploaded: { ...s.gradesUploaded, [deadlineId]: next } };
  });
}

// ---------- Proyectos ----------
export function saveProject(p: Project) {
  setState((s) => ({ ...s, projects: s.projects.some((x) => x.id === p.id) ? s.projects.map((x) => (x.id === p.id ? p : x)) : [...s.projects, p] }), { undoable: true });
}
export function removeProject(id: string) {
  setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }), { undoable: true });
}
export function updateProject(id: string, fn: (p: Project) => Project) {
  setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }));
}
export function addMember(projectId: string, m: Member) {
  updateProject(projectId, (p) => ({ ...p, members: [...p.members, m] }));
}
export function toggleMilestone(projectId: string, mid: string) {
  updateProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === mid ? { ...m, done: !m.done } : m)) }));
}
export function addMilestone(projectId: string, m: Milestone) {
  updateProject(projectId, (p) => ({ ...p, milestones: [...p.milestones, m].sort((a, b) => a.date.localeCompare(b.date)) }));
}

// ---------- Invitaciones ----------
export function respondInvitation(id: string, status: Invitation['status'], proposal?: Invitation['proposal']) {
  setState(
    (s) => {
      const inv = s.invitations.find((i) => i.id === id);
      if (!inv) return s;
      let next = { ...s, invitations: s.invitations.map((i) => (i.id === id ? { ...i, status, proposal } : i)) };
      if (status === 'aceptada') {
        next = applyOps(next, [
          { type: 'add', activity: { id: uid('a'), title: inv.title, kind: 'proyecto', date: inv.date, start: inv.start, end: inv.end, location: inv.location, projectId: inv.projectId, source: 'invitacion' } }
        ]);
      }
      return next;
    },
    { undoable: true }
  );
}
export function addInvitation(inv: Invitation) {
  setState((s) => ({ ...s, invitations: [inv, ...s.invitations] }));
}

// ---------- Tesistas ----------
export function saveThesis(t: Thesis) {
  setState((s) => ({ ...s, theses: s.theses.some((x) => x.id === t.id) ? s.theses.map((x) => (x.id === t.id ? t : x)) : [...s.theses, t] }), { undoable: true });
}
export function removeThesis(id: string) {
  setState((s) => ({ ...s, theses: s.theses.filter((t) => t.id !== id) }), { undoable: true });
}

// ---------- Avisos del sistema ----------
export function markNoticesRead() {
  setState((s) => ({ ...s, notices: s.notices.map((n) => ({ ...n, read: true })) }));
}
export function addNotice(n: Omit<Notice, 'id' | 'createdAt' | 'read'>) {
  setState((s) => ({ ...s, notices: [{ ...n, id: uid('n'), createdAt: new Date().toISOString(), read: false }, ...s.notices] }));
}

// ---------- Chat del asistente ----------
export function pushMessage(m: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
  const msg = { ...m, id: uid('m'), at: new Date().toISOString() };
  setState((s) => ({ ...s, chat: [...s.chat, msg].slice(-60) }));
  return msg;
}
export function updateMessage(id: string, patch: Partial<ChatMessage>) {
  setState((s) => ({ ...s, chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}
export function clearChat() {
  setState((s) => ({ ...s, chat: [] }));
}

// ---------- Datos ----------
export function replaceState(next: AppState) {
  setState(() => next);
}
export function resetAll() {
  undoStack.length = 0;
  setState(() => emptyState());
}
export function exportBackup(): string {
  return JSON.stringify(state, null, 2);
}
export function importBackup(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as AppState;
    if (parsed.version !== 1 || !parsed.settings) return false;
    const base = emptyState();
    replaceState({ ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } });
    return true;
  } catch {
    return false;
  }
}
