import { useRef, useState } from 'react';
import type { Kind } from '../lib/types';
import { getState, replaceState, setState, syncEspoch, toast, updateSettings, useAppState } from '../lib/store';
import { demoState } from '../lib/demo';
import { parseICS } from '../lib/ics';
import { courseName } from '../lib/schedule';
import { longDate } from '../lib/dates';
import { SheetHost } from '../sheets/Sheets';
import * as Icon from '../ui/icons';

export const FACULTIES: Record<string, string[]> = {
  'Informática y Electrónica': ['Software', 'Telecomunicaciones', 'Electrónica y Automatización', 'Electricidad', 'Diseño Gráfico', 'Tecnologías de la Información'],
  Mecánica: ['Mecánica', 'Ingeniería Automotriz', 'Ingeniería Industrial', 'Mantenimiento Industrial'],
  Ciencias: ['Matemática', 'Física', 'Estadística', 'Química', 'Biofísica', 'Ingeniería Química', 'Ingeniería Ambiental'],
  'Ciencias Pecuarias': ['Zootecnia', 'Medicina Veterinaria', 'Agroindustria'],
  'Recursos Naturales': ['Agronomía', 'Ingeniería Forestal', 'Turismo'],
  'Salud Pública': ['Medicina', 'Nutrición y Dietética', 'Promoción de la Salud', 'Gastronomía'],
  'Administración de Empresas': ['Administración de Empresas', 'Contabilidad y Auditoría', 'Mercadotecnia', 'Finanzas', 'Gestión del Transporte', 'Comercio'],
  'Sede Morona Santiago': [],
  'Sede Orellana': []
};

const DESIGNATIONS: { kind: Kind; title: string; sub: string; icon: JSX.Element }[] = [
  { kind: 'clase', title: 'Clases', sub: 'Horario, preparación y calificación', icon: <Icon.Board size={18} /> },
  { kind: 'comision', title: 'Comisión de Carrera', sub: 'Reuniones y tareas administrativas', icon: <Icon.Users size={18} /> },
  { kind: 'proyecto', title: 'Investigación o Vinculación', sub: 'Hitos, entregables y reuniones', icon: <Icon.Folder size={18} /> },
  { kind: 'titulacion', title: 'Comisión de Titulación', sub: 'Tesistas, tribunales y defensas', icon: <Icon.Cap size={18} /> }
];

function Steps({ n }: { n: number }) {
  return (
    <div className="steps" aria-label={'Paso ' + n + ' de 5'}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </div>
  );
}

export default function Onboarding() {
  const s = useAppState();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(s.settings.name);
  const [email, setEmail] = useState(s.settings.email);
  const [err, setErr] = useState<string | null>(null);
  const [faculty, setFaculty] = useState(s.settings.faculty || 'Informática y Electrónica');
  const [career, setCareer] = useState(s.settings.career);
  const [desig, setDesig] = useState<Kind[]>(s.settings.designations.length ? s.settings.designations : ['clase']);
  const [courseSheet, setCourseSheet] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const next = () => setStep((x) => x + 1);

  const explore = async () => {
    setSyncing(true);
    await syncEspoch();
    const st = getState();
    replaceState({ ...demoState(st), notices: [], settings: { ...demoState(st).settings, onboarded: true, email: email || st.settings.email } });
    setSyncing(false);
    toast('Datos de ejemplo cargados. Puedes borrarlos desde Perfil.');
  };

  const step1 = () => {
    if (!name.trim()) return setErr('Escribe tu nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Escribe un correo válido.');
    updateSettings({ name: name.trim(), email: email.trim().toLowerCase() });
    setErr(null);
    next();
  };

  const importIcs = async (f: File) => {
    const items = parseICS(await f.text(), 'clase');
    if (!items.length) return toast('No encontré eventos con hora en ese archivo');
    setState((st) => ({ ...st, activities: [...st.activities, ...items] }));
    toast(items.length + ' eventos importados');
  };

  const connect = async () => {
    setSyncing(true);
    const r = await syncEspoch();
    setSyncing(false);
    if (r.ok) toast('Calendario ESPOCH conectado');
    else toast('No se pudo descargar el calendario. Revisa tu conexión.');
  };

  const finish = () => {
    updateSettings({ onboarded: true });
    toast('Todo listo. Este es tu día.');
  };

  return (
    <div className="onb anim-in" key={step}>
      <Steps n={step} />

      {step === 1 && (
        <>
          <div className="row" style={{ marginTop: 16 }}>
            <span className="logo"><Icon.Logo size={26} /></span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>DocenTime</span>
          </div>
          <h1 className="h1" style={{ fontSize: 38, lineHeight: 1.05 }}>Tu semestre, en un solo cronograma.</h1>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>Clases, comisiones, proyectos y titulación en un mismo lugar, con un asistente que organiza y te avisa a tiempo.</p>
          <div className="stack">
            <label className="field">
              Nombre
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="Dra. Lucía Andrade" autoComplete="name" />
            </label>
            <label className="field">
              Correo institucional
              <input className="input" type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="nombre.apellido@espoch.edu.ec" autoComplete="email" />
            </label>
            {email && !/@espoch\.edu\.ec$/i.test(email.trim()) && /@/.test(email) && <div className="small muted">Te recomendamos usar tu correo @espoch.edu.ec.</div>}
            {err && <div className="error">{err}</div>}
          </div>
          <div className="stack" style={{ marginTop: 'auto' }}>
            <button className="btn" onClick={step1}>Continuar</button>
            <button className="btn btn-ghost" onClick={explore} disabled={syncing}>{syncing ? 'Cargando…' : 'Solo quiero explorar con datos de ejemplo'}</button>
            <div className="xs muted center">Tus datos se guardan solo en este dispositivo.</div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <div className="eyebrow">Paso 2 de 5</div>
            <h1 className="h1">¿Dónde y en qué trabajas?</h1>
          </div>
          <label className="field">
            Facultad
            <select className="input" value={faculty} onChange={(e) => { setFaculty(e.target.value); setCareer(''); }}>
              {Object.keys(FACULTIES).map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">
            Carrera
            <input className="input" list="carreras" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="Escribe o elige tu carrera" />
            <datalist id="carreras">{(FACULTIES[faculty] ?? []).map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <div className="field">
            Tus designaciones este semestre
            <div className="stack">
              {DESIGNATIONS.map((d) => {
                const on = desig.includes(d.kind);
                return (
                  <button key={d.kind} className={'choice k-' + d.kind} aria-pressed={on} onClick={() => setDesig(on ? desig.filter((x) => x !== d.kind) : [...desig, d.kind])}>
                    <span className="choice-icon">{d.icon}</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontWeight: 600, color: 'var(--fg)' }}>{d.title}</span>
                      <span className="xs muted">{d.sub}</span>
                    </span>
                    {on && <Icon.Check size={18} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="small muted">Puedes crear designaciones personalizadas más tarde desde Perfil.</div>
          <button className="btn" style={{ marginTop: 'auto' }} onClick={() => { updateSettings({ faculty, career, designations: desig.length ? desig : ['clase'] }); next(); }}>
            Continuar con {desig.length || 1} {desig.length === 1 ? 'designación' : 'designaciones'}
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <div className="eyebrow">Paso 3 de 5</div>
            <h1 className="h1">Carga tu horario de clases</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>Con tus materias generamos cada sesión del semestre y bloques de preparación y calificación.</p>
          </div>
          <div className="stack">
            <button className="choice" onClick={() => setCourseSheet(true)}>
              <span className="choice-icon"><Icon.Edit size={18} /></span>
              <span className="grow"><span style={{ display: 'block', fontWeight: 600 }}>Ingresar a mano</span><span className="xs muted">Materia, paralelo, aula, días y horas</span></span>
              <Icon.Plus size={18} />
            </button>
            <button className="choice" onClick={() => fileRef.current?.click()}>
              <span className="choice-icon"><Icon.Upload size={18} /></span>
              <span className="grow"><span style={{ display: 'block', fontWeight: 600 }}>Importar calendario .ics</span><span className="xs muted">Desde Google Calendar, Outlook o iOS</span></span>
            </button>
            <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => e.target.files?.[0] && importIcs(e.target.files[0])} />
            <div className="choice" aria-disabled="true" style={{ opacity: 0.6 }}>
              <span className="choice-icon"><Icon.Camera size={18} /></span>
              <span className="grow"><span style={{ display: 'block', fontWeight: 600 }}>Foto o PDF con IA</span><span className="xs muted">Disponible cuando se conecte la IA</span></span>
            </div>
          </div>
          {s.courses.length > 0 && (
            <div className="card-flat stack">
              <div className="mono">{s.courses.length} {s.courses.length === 1 ? 'materia' : 'materias'}</div>
              {s.courses.map((c) => (
                <div key={c.id} className="row-between small">
                  <span style={{ fontWeight: 600 }}>{courseName(c)}</span>
                  <span className="muted">{c.slots.length} {c.slots.length === 1 ? 'sesión' : 'sesiones'} por semana</span>
                </div>
              ))}
            </div>
          )}
          <div className="stack" style={{ marginTop: 'auto' }}>
            <button className="btn" onClick={next}>{s.courses.length ? 'Confirmar horario' : 'Continuar'}</button>
            {!s.courses.length && <button className="btn-link" onClick={next}>Lo hago después</button>}
          </div>
          {courseSheet && <SheetHost sheet={{ type: 'materia' }} onClose={() => setCourseSheet(false)} />}
        </>
      )}

      {step === 4 && (
        <>
          <div>
            <div className="eyebrow">Paso 4 de 5</div>
            <h1 className="h1">Conecta el calendario académico</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>Fechas oficiales de la ESPOCH: semestre, parciales, feriados y, sobre todo, los límites para subir notas.</p>
          </div>
          {s.calendar ? (
            <div className="card">
              <div className="row-between">
                <span className="h3">{s.calendar.periodo}</span>
                <span className="badge badge-ok">Conectado</span>
              </div>
              {s.calendar.esEjemplo && <div className="warn">Estas fechas son de ejemplo hasta cargar el calendario oficial vigente.</div>}
              <div className="stack">
                {s.calendar.fechas.filter((f) => f.type === 'notas' || f.type === 'inicio' || f.type === 'fin').map((f) => (
                  <div key={f.id} className={'row-between small' + (f.type === 'notas' ? '' : '')}>
                    <span style={{ fontWeight: f.type === 'notas' ? 600 : 400, color: f.type === 'notas' ? 'var(--red-fg)' : undefined }}>{f.title}</span>
                    <span className="muted">{longDate(f.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="list">
              {['Inicio y fin de semestre', 'Parciales y exámenes', 'Feriados', 'Límites para subir notas al e-learning'].map((t, i) => (
                <div key={t} className="li" style={i === 3 ? { background: 'var(--red-t)' } : undefined}>
                  <span className="row"><Icon.Check size={16} /> <span style={{ fontWeight: i === 3 ? 600 : 400 }}>{t}</span></span>
                  {i === 3 && <span className="badge badge-red">Prioridad alta</span>}
                </div>
              ))}
            </div>
          )}
          <div className="why">Te avisamos si una fecha cambia. Si alguna no se puede leer con certeza, se revisa a mano antes de publicarla.</div>
          <div className="stack" style={{ marginTop: 'auto' }}>
            {s.calendar ? <button className="btn" onClick={next}>Continuar</button> : <button className="btn" onClick={connect} disabled={syncing}>{syncing ? 'Conectando…' : 'Conectar calendario'}</button>}
            {!s.calendar && <button className="btn-link" onClick={next}>Ahora no</button>}
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <div>
            <div className="eyebrow">Paso 5 de 5</div>
            <h1 className="h1">Pídeselo al asistente, como lo dirías.</h1>
          </div>
          <div className="stack">
            <div className="msg me"><div className="bubble">Agrega una reunión del proyecto de vinculación el jueves a las 10</div></div>
            <div className="proposal">
              <div className="eyebrow">Vista previa · nueva actividad</div>
              <div className="h3">Reunión del proyecto de vinculación</div>
              <div className="small muted">Jueves · 10:00 – 11:00 · sin cruces</div>
              <div className="row"><span className="btn btn-sm grow">Confirmar</span><span className="btn btn-ghost btn-sm grow">Cancelar</span></div>
            </div>
          </div>
          <div className="stack">
            {['Escribe o dicta en lenguaje natural.', 'Revisa la vista previa: nada cambia hasta que confirmas.', 'Ante un feriado o imprevisto, propone un plan y explica por qué.'].map((t, i) => (
              <div key={t} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="avatar" style={{ fontFamily: 'var(--mono)' }}>{i + 1}</span>
                <span className="small">{t}</span>
              </div>
            ))}
          </div>
          <div className="why">Modo demo: el asistente usa reglas y respuestas predefinidas, sin conexión a un servicio de IA.</div>
          {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
            <button className="btn btn-ghost" onClick={() => Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Avisos activados' : 'Avisos no activados'))}>
              <Icon.Bell size={18} /> Activar avisos de vencimiento
            </button>
          )}
          <button className="btn" style={{ marginTop: 'auto' }} onClick={finish}>Ver mi día de hoy</button>
        </>
      )}

      {step > 1 && (
        <button className="btn-link" onClick={() => setStep((x) => x - 1)} style={{ alignSelf: 'center' }}>Volver</button>
      )}
    </div>
  );
}
