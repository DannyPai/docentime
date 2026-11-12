// Navegación de la app: pestañas, pantallas apiladas y hojas emergentes.
import { createContext, useContext } from 'react';
import type { Course, Occ, Task } from '../lib/types';

export type Tab = 'hoy' | 'calendario' | 'asistente' | 'proyectos' | 'perfil';

export type Route =
  | { name: 'notificaciones' }
  | { name: 'proyecto'; id: string }
  | { name: 'reunion'; projectId: string }
  | { name: 'tesistas' }
  | { name: 'materias' }
  | { name: 'tareas' }
  | { name: 'calendario-espoch' };

export type SheetState =
  | { type: 'evento'; occ: Occ }
  | { type: 'nuevo-evento'; date?: string; start?: string }
  | { type: 'rapido' }
  | { type: 'tarea'; task?: Task }
  | { type: 'materia'; course?: Course };

export interface Nav {
  tab: Tab;
  go: (tab: Tab, opts?: { date?: string }) => void;
  push: (r: Route) => void;
  back: () => void;
  sheet: (s: SheetState) => void;
  ask: (prompt: string) => void;
  calendarDate?: string;
}

export const NavContext = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavContext);
