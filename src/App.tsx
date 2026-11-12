import { useCallback, useEffect, useMemo, useState } from 'react';
import { getState, syncEspoch, useAppState, useToasts, dismissToast } from './lib/store';
import { computeAlerts, notifySystem, unseenCount } from './lib/alerts';
import { NavContext, type Nav, type Route, type SheetState, type Tab } from './ui/nav';
import * as Icon from './ui/icons';
import Onboarding from './screens/Onboarding';
import Today from './screens/Today';
import CalendarScreen from './screens/CalendarScreen';
import AssistantScreen from './screens/AssistantScreen';
import Projects, { ProjectDetail, MeetingPlanner } from './screens/Projects';
import Profile, { CoursesScreen, EspochScreen } from './screens/Profile';
import Notifications from './screens/Notifications';
import Theses from './screens/Theses';
import TasksScreen from './screens/TasksScreen';
import { SheetHost } from './sheets/Sheets';

function useTheme(pref: 'sistema' | 'claro' | 'oscuro') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'oscuro' || (pref === 'sistema' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#140E0C' : '#FFFFFF');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const s = useAppState();
  useTheme(s.settings.theme);
  const [tab, setTab] = useState<Tab>('hoy');
  const [stack, setStack] = useState<Route[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [calDate, setCalDate] = useState<string>();
  const [prompt, setPrompt] = useState<string | null>(null);

  // Notificaciones del sistema (si el docente dio permiso) mientras la app está abierta.
  useEffect(() => {
    const run = () => notifySystem(getState(), computeAlerts(getState()));
    run();
    const t = setInterval(run, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Sincroniza el calendario ESPOCH una vez al día.
  useEffect(() => {
    const st = getState().settings;
    if (!st.onboarded || !st.espochConnected) return;
    const last = st.espochSyncedAt ? Date.parse(st.espochSyncedAt) : 0;
    if (Date.now() - last > 24 * 3600 * 1000) void syncEspoch();
  }, []);

  const go = useCallback((t: Tab, opts?: { date?: string }) => {
    setStack([]);
    setTab(t);
    if (opts?.date) setCalDate(opts.date);
  }, []);

  const nav: Nav = useMemo(
    () => ({
      tab,
      go,
      push: (r) => setStack((st) => [...st, r]),
      back: () => setStack((st) => st.slice(0, -1)),
      sheet: (x) => setSheet(x),
      ask: (p) => {
        setPrompt(p);
        setStack([]);
        setTab('asistente');
      },
      calendarDate: calDate
    }),
    [tab, go, calDate]
  );

  const alerts = useMemo(() => computeAlerts(s), [s]);
  const unseen = unseenCount(alerts);

  if (!s.settings.onboarded) {
    return (
      <div className="app">
        <Onboarding />
        <Toasts />
      </div>
    );
  }

  const route = stack[stack.length - 1];
  let screen: JSX.Element;
  let key: string;
  if (route) {
    key = route.name + ('id' in route ? route.id : '') + ('projectId' in route ? route.projectId : '');
    switch (route.name) {
      case 'notificaciones': screen = <Notifications alerts={alerts} />; break;
      case 'proyecto': screen = <ProjectDetail id={route.id} />; break;
      case 'reunion': screen = <MeetingPlanner projectId={route.projectId} />; break;
      case 'tesistas': screen = <Theses />; break;
      case 'materias': screen = <CoursesScreen />; break;
      case 'tareas': screen = <TasksScreen />; break;
      case 'calendario-espoch': screen = <EspochScreen />; break;
    }
  } else {
    key = tab;
    switch (tab) {
      case 'hoy': screen = <Today unseen={unseen} />; break;
      case 'calendario': screen = <CalendarScreen key={calDate} initialDate={calDate} />; break;
      case 'asistente': screen = <AssistantScreen prompt={prompt} onPromptUsed={() => setPrompt(null)} />; break;
      case 'proyectos': screen = <Projects />; break;
      case 'perfil': screen = <Profile />; break;
    }
  }

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'hoy', label: 'Hoy', icon: <Icon.Sun size={22} /> },
    { id: 'calendario', label: 'Calendario', icon: <Icon.Cal size={22} /> },
    { id: 'asistente', label: 'Asistente', icon: <Icon.Spark size={20} /> },
    { id: 'proyectos', label: 'Proyectos', icon: <Icon.Folder size={22} /> },
    { id: 'perfil', label: 'Perfil', icon: <Icon.User size={22} /> }
  ];

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <div key={key} className="anim-in" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {screen!}
        </div>
        <nav className="tabbar" aria-label="Principal">
          {tabs.map((t) =>
            t.id === 'asistente' ? (
              <button key={t.id} className="tab tab-ai" aria-current={tab === t.id && !route ? 'page' : undefined} onClick={() => go(t.id)} aria-label="Asistente IA">
                <span className="ai-ring">
                  <span className="ai-core">{t.icon}</span>
                </span>
                {t.label}
              </button>
            ) : (
              <button key={t.id} className="tab" aria-current={tab === t.id && !route ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.icon}
                {t.label}
              </button>
            )
          )}
        </nav>
        {sheet && <SheetHost sheet={sheet} onClose={() => setSheet(null)} />}
        <Toasts />
      </div>
    </NavContext.Provider>
  );
}
