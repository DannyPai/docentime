# DocenTime

Cronograma inteligente para docentes de educación superior, pensado inicialmente para la ESPOCH (Riobamba, Ecuador). Une en un solo lugar las clases, la Comisión de Carrera, los proyectos de investigación y vinculación y la Comisión de Titulación, con un asistente que crea, mueve y reorganiza actividades y avisa de los plazos, sobre todo los de carga de calificaciones.

> **Versión de prueba.** El asistente funciona en **modo demo**: entiende pedidos en español con reglas y respuestas predefinidas, sin conectarse a ningún servicio de IA. Todos los datos se guardan **solo en el dispositivo** de cada docente.

## Cómo probarla en el iPhone

1. Abre el enlace de la app en **Safari** (en Chrome para iOS no se puede instalar).
2. Toca el botón **Compartir** y elige **Añadir a pantalla de inicio**.
3. Abre DocenTime desde el ícono. Funciona a pantalla completa y sin conexión.

En Android, abre el enlace en Chrome y elige **Instalar aplicación**. En computadora también funciona desde el navegador.

Para explorar sin cargar nada, en la primera pantalla toca **Solo quiero explorar con datos de ejemplo**. Los datos de ejemplo se pueden borrar desde Perfil.

## Qué incluye

- **Hoy**: resumen del día, plazo de carga de notas con avance por materia, agenda, tareas, invitaciones y registro rápido (botón +).
- **Calendario**: vistas de día, semana, mes y agenda, con las fechas ESPOCH, feriados y huecos libres. Toca un espacio vacío para crear una actividad.
- **Horario académico**: materias con paralelo, aula, días y horas. Las sesiones se generan para todo el semestre, se omiten en feriados y se crean bloques automáticos de preparación y calificación. Cada sesión o bloque se puede mover o eliminar solo para una fecha.
- **Asistente** (texto y voz): crea, mueve y elimina actividades; crea tareas; reorganiza el día ante un imprevisto; responde qué hay pendiente antes de subir notas, los huecos libres y los resúmenes diario y semanal. Siempre muestra una vista previa y espera confirmación; cada cambio se puede deshacer.
- **Proyectos y comisiones**: miembros, hitos y entregables en una línea de tiempo, tareas del proyecto e invitaciones (aceptar, reprogramar o rechazar).
- **Reuniones sin cruces**: calcula los mejores horarios comunes con la disponibilidad de los miembros. La disponibilidad se comparte con un código que solo dice ocupado/libre, nunca el detalle de las actividades. Al agendar, genera una invitación .ics.
- **Tesistas**: etapa, última revisión, próxima cita, observaciones por resolver, tribunales y defensas.
- **Notificaciones**: vencimientos (configurables a 1 semana, 3 días y 24 h, con prioridad alta para la carga de notas), cruces de actividades, invitaciones y cambios del calendario ESPOCH. Modo no molestar y horario de silencio.
- **Perfil**: designaciones, reporte semanal de carga horaria por designación, tema claro u oscuro, exportar e importar .ics (Google Calendar, Outlook, Calendario de iOS) y copia de seguridad para pasar los datos a otro dispositivo.

## Calendario académico de la ESPOCH

Las fechas oficiales se leen del archivo [`public/espoch-calendario.json`](public/espoch-calendario.json). La app lo descarga una vez al día y avisa al docente si una fecha cambió.

Las fechas actuales corresponden al período **septiembre 2026 – febrero 2027**, transcritas del [calendario académico oficial](https://www.espoch.edu.ec/calendario-academico-2/). Para actualizarlo (por ejemplo, al empezar el período marzo – julio 2027):

1. Edita `public/espoch-calendario.json` (se puede hacer desde la web de GitHub).
2. Cambia `periodo` y `actualizado` y escribe las fechas. Cada fecha lleva un `id` estable, un `title`, un `type` y `date` (y `endDate` si dura varios días; en las de tipo `notas`, `endDate` es el día en que vence la consignación):

```json
{ "id": "notas-p1", "title": "Límite de carga de notas · Parcial 1", "type": "notas", "date": "2026-11-27" }
```

Tipos válidos: `inicio`, `fin`, `parcial`, `examen`, `feriado`, `notas`, `otro`. El semestre va desde la fecha `inicio` hasta la fecha `fin`; las clases no se generan en los días `feriado`.

3. Guarda el cambio en la rama `main`. La app se vuelve a publicar sola y los docentes reciben las fechas nuevas.

Mantener el `id` de una fecha permite que la app detecte que cambió y lo notifique.

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev      # servidor local en http://localhost:5173
npm test         # pruebas del asistente
npm run build    # versión de producción en dist/
```

Estructura principal:

- `src/lib/schedule.ts`: genera las sesiones de clase, los bloques automáticos, los huecos libres y los cruces.
- `src/lib/assistant.ts`: el asistente en modo demo (fechas, horas e intenciones en español).
- `src/lib/store.ts`: estado, guardado local y deshacer.
- `src/screens/`: pantallas. `src/sheets/`: ventanas emergentes.

## Publicación en GitHub Pages

El flujo `.github/workflows/deploy.yml` compila, ejecuta las pruebas y publica la app cada vez que se sube un cambio a `main`. En el repositorio, ve a **Settings › Pages** y en **Source** elige **GitHub Actions**. La dirección será `https://<usuario>.github.io/<repositorio>/`.

## Limitaciones de esta versión

- No hay servidor: los datos de cada docente viven en su dispositivo. Para pasarlos a otro, usa la copia de seguridad en Perfil.
- La disponibilidad de otros miembros se comparte con un código; no se sincroniza sola.
- Las notificaciones del sistema solo aparecen con la app abierta (en iPhone, además, hay que añadirla a la pantalla de inicio).
- La lectura del horario desde foto o PDF requiere conectar la IA.
- El dictado por voz depende del navegador; en iPhone también se puede usar el micrófono del teclado.
