import { useEffect, useRef, useState } from 'react'
import { Box, CalendarDays, ChartGantt, Flag, GitBranch, Keyboard, Layers, Lock, MousePointerClick, Rocket, TrendingUp, X } from 'lucide-react'

/**
 * The in-app guide: a window with a list of topics and, for each, drawings made with the app's own colors and
 * controls, so it reads at a glance. Nothing here is a screenshot, so it follows the theme and never goes stale
 * visually.
 */

const Kbd = ({ children }: { children: React.ReactNode }): React.JSX.Element => <kbd className="help-kbd">{children}</kbd>

/** A row of numbered steps joined by arrows. */
function Steps({ items }: { items: { title: string; text: string }[] }): React.JSX.Element {
  return (
    <ol className="help-steps">
      {items.map((s, i) => (
        <li key={s.title}>
          <span className="help-step-n">{i + 1}</span>
          <b>{s.title}</b>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  )
}

const Tip = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div className="help-tip">{children}</div>

/** Two bars and the arrow between them, for each way of linking tasks. */
function LinkDiagram({ type }: { type: 'FS' | 'SS' | 'FF' | 'SF' }): React.JSX.Element {
  const a = { x: 20, w: 90 }
  const b = { FS: { x: 120, w: 90 }, SS: { x: 20, w: 90 }, FF: { x: 50, w: 60 }, SF: { x: 130, w: 70 } }[type]
  // Where the arrow leaves task A and where it lands on task B.
  const from = type === 'FS' || type === 'FF' ? a.x + a.w : a.x
  const to = type === 'FS' || type === 'SS' ? b.x : b.x + b.w
  const mid = type === 'SF' ? 12 : 8
  const path =
    type === 'FS'
      ? `M${from} 17 H${from + mid} V50 H${to - 4}`
      : type === 'SS'
        ? `M${from} 17 H${from - mid} V50 H${to - 4}`
        : type === 'FF'
          ? `M${from} 17 H${from + mid} V50 H${to + 4}`
          : `M${from} 17 H${from - mid} V50 H${to + 4}`
  return (
    <svg viewBox="0 0 230 64" className="help-svg" aria-hidden="true">
      <rect x={a.x} y="8" width={a.w} height="18" rx="4" className="help-bar a" />
      <rect x={b.x} y="41" width={b.w} height="18" rx="4" className="help-bar b" />
      <text x={a.x + 8} y="21" className="help-bar-label">A</text>
      <text x={b.x + 8} y="54" className="help-bar-label">B</text>
      <path d={path} className="help-arrow" fill="none" />
      <circle cx={to + (type === 'FS' || type === 'SS' ? -4 : 4)} cy="50" r="2.5" className="help-dot" />
    </svg>
  )
}

const LINKS: { code: 'FS' | 'SS' | 'FF' | 'SF'; name: string; text: string }[] = [
  { code: 'FS', name: 'Fin a inicio', text: 'B empieza cuando A termina. Es el más común: no puedes pintar antes de revocar.' },
  { code: 'SS', name: 'Inicio a inicio', text: 'B empieza cuando A empieza (o algo después). Sirven para trabajos en paralelo.' },
  { code: 'FF', name: 'Fin a fin', text: 'B termina cuando A termina. Típico de inspecciones y limpiezas finales.' },
  { code: 'SF', name: 'Inicio a fin', text: 'B termina cuando A empieza. Es raro: relevos y turnos.' }
]

/** A small Gantt table with its bars, for the first screen. */
function MiniGantt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 420 150" className="help-svg help-wide" aria-hidden="true">
      <rect x="0.5" y="0.5" width="419" height="149" rx="8" className="help-frame" />
      <line x1="140" y1="0" x2="140" y2="150" className="help-line" />
      {['Obra gruesa', 'Fundaciones', 'Losa piso 1', 'Terminaciones'].map((t, i) => (
        <g key={t}>
          <text x="12" y={34 + i * 30} className={`help-text${i % 3 === 0 ? ' bold' : ''}`}>
            {t}
          </text>
          <line x1="0" x2="420" y1={42 + i * 30} y2={42 + i * 30} className="help-line" />
        </g>
      ))}
      <rect x="150" y="22" width="170" height="10" rx="3" className="help-bar parent" />
      <rect x="150" y="52" width="70" height="14" rx="4" className="help-bar a" />
      <rect x="226" y="82" width="70" height="14" rx="4" className="help-bar a" />
      <rect x="302" y="112" width="100" height="14" rx="4" className="help-bar b" />
      <path d="M220 59 H224 V89 H224" className="help-arrow" fill="none" />
      <path d="M296 89 H300 V119 H300" className="help-arrow" fill="none" />
    </svg>
  )
}

const CONSTRAINTS: { code: string; name: string; text: string; bar: [number, number]; mark?: 'start' | 'end'; markAt?: number }[] = [
  { code: 'ASAP', name: 'Lo antes posible', text: 'Normal: la tarea arranca en cuanto puede.', bar: [10, 60] },
  { code: 'ALAP', name: 'Lo más tarde posible', text: 'Se retrasa todo lo que pueda sin atrasar a su sucesora.', bar: [90, 60] },
  { code: 'SNET', name: 'No empezar antes de', text: 'Una fecha mínima de inicio: espera a una entrega o permiso.', bar: [60, 60], mark: 'start', markAt: 60 },
  { code: 'SNLT', name: 'No empezar después de', text: 'Debe empezar a más tardar ese día; si no se puede, marca conflicto.', bar: [30, 60], mark: 'start', markAt: 90 },
  { code: 'FNET', name: 'No terminar antes de', text: 'No puede terminar antes de esa fecha (curado, plazo de proveedor).', bar: [60, 60], mark: 'end', markAt: 120 },
  { code: 'FNLT', name: 'No terminar después de', text: 'Fecha límite de término; si se pasa, queda en conflicto.', bar: [30, 60], mark: 'end', markAt: 100 },
  { code: 'MSO', name: 'Debe empezar el', text: 'Fija el inicio exactamente ese día.', bar: [70, 60], mark: 'start', markAt: 70 },
  { code: 'MFO', name: 'Debe terminar el', text: 'Fija el término exactamente ese día.', bar: [70, 60], mark: 'end', markAt: 130 }
]

function ConstraintCard({ c }: { c: (typeof CONSTRAINTS)[number] }): React.JSX.Element {
  return (
    <div className="help-card">
      <svg viewBox="0 0 170 34" className="help-svg" aria-hidden="true">
        <line x1="10" y1="30" x2="160" y2="30" className="help-line" />
        <rect x={c.bar[0]} y="8" width={c.bar[1]} height="14" rx="4" className="help-bar a" />
        {c.mark && <line x1={c.markAt} y1="2" x2={c.markAt} y2="32" className="help-mark" />}
      </svg>
      <b>
        <code>{c.code}</code> {c.name}
      </b>
      <span>{c.text}</span>
    </div>
  )
}

/** The legend of colors of the 3D view. */
const Swatch = ({ color, children }: { color: string; children: React.ReactNode }): React.JSX.Element => (
  <span className="help-swatch">
    <i style={{ background: color }} />
    {children}
  </span>
)

function SelectionMock(): React.JSX.Element {
  return (
    <div className="help-mock bim-selbar" style={{ position: 'static', width: 'auto', maxWidth: 320 }}>
      <div className="bim-selbar-main">
        <span className="bim-selbar-dot" />
        <div className="bim-selbar-text">
          <b>5 elementos seleccionados</b>
          <span>5 × muro — Piso 1</span>
        </div>
      </div>
      <div className="bim-selbar-actions">
        <button className="primary" tabIndex={-1}>
          Asignar a «Losa piso 1»
        </button>
        <button tabIndex={-1}>Crear grupo</button>
      </div>
      <div className="bim-selbar-hint">Ctrl + clic suma o quita · clic en vacío o Esc deselecciona</div>
    </div>
  )
}

function SCurveMock(): React.JSX.Element {
  return (
    <svg viewBox="0 0 320 130" className="help-svg help-wide" aria-hidden="true">
      <rect x="0.5" y="0.5" width="319" height="129" rx="8" className="help-frame" />
      {[30, 60, 90].map((y) => (
        <line key={y} x1="10" x2="310" y1={y} y2={y} className="help-line dashed" />
      ))}
      <path d="M14 118 C70 116 110 100 160 70 S270 20 306 14" className="help-curve plan" fill="none" />
      <path d="M14 118 C70 117 110 108 150 96" className="help-curve real" fill="none" />
      <path d="M150 96 L306 56" className="help-curve real dashed" fill="none" />
      <line x1="150" y1="6" x2="150" y2="124" className="help-today" />
      <text x="154" y="16" className="help-text small">hoy</text>
      <text x="198" y="108" className="help-text small">atraso</text>
    </svg>
  )
}

interface Topic {
  id: string
  title: string
  icon: React.ReactNode
  body: () => React.JSX.Element
}

const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Empezar',
    icon: <Rocket size={16} />,
    body: () => (
      <>
        <p className="help-lead">Opengantt BIM une dos cosas: el cronograma de la obra (Gantt) y el modelo 3D del edificio (BIM). Cada tarea puede tener elementos del modelo y así ves la obra construirse en el tiempo.</p>
        <Steps
          items={[
            { title: 'Crea o abre un proyecto', text: 'En la pantalla de proyectos, «Nuevo», o importa uno de MS Project.' },
            { title: 'Arma el cronograma', text: 'Agrega tareas, duraciones y vínculos en el Gantt.' },
            { title: 'Importa el modelo', text: 'En el Visor 3D, el botón de subir carga un archivo .ifc.' },
            { title: 'Asigna elementos', text: 'Selecciona piezas del modelo y asígnalas a la tarea.' },
            { title: 'Simula en 4D', text: 'Pulsa «4D» y reproduce la construcción día a día.' }
          ]}
        />
        <MiniGantt />
        <Tip>
          Todo se guarda solo (mira «Guardado» abajo a la derecha). Con <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> abres la paleta: escribe lo que quieres hacer y la app te lo encuentra.
        </Tip>
      </>
    )
  },
  {
    id: 'gantt',
    title: 'El Gantt',
    icon: <ChartGantt size={16} />,
    body: () => (
      <>
        <p className="help-lead">La tabla de la izquierda y las barras de la derecha son lo mismo: lo que cambies en una se ve en la otra.</p>
        <div className="help-grid">
          <div className="help-card">
            <b>Crear una tarea</b>
            <span>Escribe en la fila gris «Nueva tarea…» al final de la tabla. Se crea después de la última, en el mismo grupo.</span>
          </div>
          <div className="help-card">
            <b>Editar en la tabla</b>
            <span>Un clic en una celda la abre: nombre, inicio, fin, días, avance. <Kbd>Enter</Kbd> acepta y <Kbd>Esc</Kbd> cancela.</span>
          </div>
          <div className="help-card">
            <b>Mover y alargar</b>
            <span>Arrastra una barra para moverla o su borde para cambiar la duración. Los días corren solo sobre días laborables.</span>
          </div>
          <div className="help-card">
            <b>Vincular</b>
            <span>Pasa el cursor sobre una barra y arrastra el punto de su extremo hasta otra tarea. También puedes escribirlo en la columna Predecesoras.</span>
          </div>
          <div className="help-card">
            <b>Elegir columnas</b>
            <span>Clic derecho sobre la cabecera de la tabla: marca las que quieres ver. Más espacio para el Gantt: la flecha entre tabla y barras colapsa la tabla.</span>
          </div>
          <div className="help-card">
            <b>Más opciones de una tarea</b>
            <span>Doble clic abre la ficha con restricción, línea base y plazo.</span>
          </div>
        </div>
        <Tip>
          Seleccionar varias tareas: <Kbd>Ctrl</Kbd> + clic suma, <Kbd>Shift</Kbd> + clic toma un rango; después puedes moverlas o borrarlas juntas.
        </Tip>
      </>
    )
  },
  {
    id: 'links',
    title: 'Vínculos y predecesoras',
    icon: <GitBranch size={16} />,
    body: () => (
      <>
        <p className="help-lead">Un vínculo dice cuándo puede empezar o terminar una tarea según otra. Hay cuatro tipos; la tarea A es la predecesora y B la que depende de ella.</p>
        <div className="help-grid two">
          {LINKS.map((l) => (
            <div className="help-card" key={l.code}>
              <LinkDiagram type={l.code} />
              <b>
                <code>{l.code}</code> {l.name}
              </b>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        <h3>La columna Predecesoras</h3>
        <p>Se escribe como en MS Project: el número de fila de la predecesora, el tipo si no es fin a inicio y el desfase.</p>
        <div className="help-code">
          <span><code>3</code> fin a inicio con la fila 3</span>
          <span><code>4SS+2d</code> inicio a inicio con la fila 4, 2 días después</span>
          <span><code>7FF-1d</code> fin a fin con la fila 7, 1 día antes</span>
          <span><code>3, 5SS+2d</code> varias, separadas por coma</span>
        </div>
        <Tip>Para ver los números de fila activa la columna «Nº» (clic derecho en la cabecera). Un desfase negativo es un adelanto.</Tip>
      </>
    )
  },
  {
    id: 'constraints',
    title: 'Restricciones y fechas',
    icon: <Lock size={16} />,
    body: () => (
      <>
        <p className="help-lead">Una restricción limita la fecha de una tarea más allá de sus vínculos. La línea vertical de cada dibujo es la fecha que fijas; la barra, la tarea.</p>
        <div className="help-grid two">
          {CONSTRAINTS.map((c) => (
            <ConstraintCard key={c.code} c={c} />
          ))}
        </div>
        <Tip>
          Si una restricción choca con los vínculos, la tarea queda marcada con un borde rojo y un «!» en la columna Restricción: algo tiene que ceder. Las restricciones se eligen en la ficha de la tarea (doble clic).
        </Tip>
        <h3>Fechas del proyecto</h3>
        <p>En el Calendario laboral puedes fijar el inicio y el término del proyecto, o programar «desde el final»: la obra se calcula hacia atrás desde la fecha de entrega.</p>
      </>
    )
  },
  {
    id: 'plan',
    title: 'Línea base y curva S',
    icon: <TrendingUp size={16} />,
    body: () => (
      <>
        <p className="help-lead">La línea base es una foto del plan original. Cuando el cronograma cambie, la foto sigue ahí y puedes ver cuánto te has movido.</p>
        <Steps
          items={[
            { title: 'Guarda la línea base', text: 'Botón «Línea base» de la barra: guarda las fechas actuales de todo el proyecto.' },
            { title: 'Trabaja y avanza', text: 'Cambia fechas y registra el avance real de cada tarea.' },
            { title: 'Compara', text: 'Las barras claras bajo cada tarea muestran el plan original y el atraso.' }
          ]}
        />
        <h3>Curva S</h3>
        <p>Muestra cuánto del proyecto debería estar hecho (azul) frente a lo que realmente se hizo (rojo). Desde hoy, la línea punteada proyecta el término al ritmo actual.</p>
        <SCurveMock />
        <p>Cada tarea pesa por sus días de trabajo, o por el volumen de sus elementos si activas «por volumen». Los porcentajes se muestran con dos decimales. Puedes basar la curva en el plan actual o en la línea base.</p>
      </>
    )
  },
  {
    id: 'bim',
    title: 'Modelo 3D y asignación',
    icon: <Box size={16} />,
    body: () => (
      <>
        <p className="help-lead">Para que el modelo siga al cronograma, cada tarea necesita sus elementos. Así se hace:</p>
        <Steps
          items={[
            { title: 'Elige la tarea', text: 'Haz clic en ella en el Gantt. El panel del visor dirá cuál está elegida.' },
            { title: 'Selecciona en el modelo', text: 'Clic en una pieza; Ctrl + clic suma o quita. Aparece una barra con lo seleccionado.' },
            { title: 'Asigna', text: 'Botón «Asignar a …» de esa barra. Las piezas de la tarea se ven en verde.' }
          ]}
        />
        <div className="help-two">
          <SelectionMock />
          <div className="help-legend">
            <b>Colores en el visor</b>
            <Swatch color="#f59e0b">Lo que tienes seleccionado</Swatch>
            <Swatch color="#22c55e">Elementos de la tarea elegida</Swatch>
            <Swatch color="#8b5cf6">Resultado de la búsqueda</Swatch>
            <Swatch color="#38bdf8">En 4D: ya construido</Swatch>
          </div>
        </div>
        <h3>Deseleccionar</h3>
        <p>
          Clic en un espacio vacío, la tecla <Kbd>Esc</Kbd> o la × de la barra. <Kbd>Ctrl</Kbd> + clic sobre una pieza ya seleccionada la quita de a una.
        </p>
        <h3>Otras formas de elegir</h3>
        <p>
          <b>Buscar:</b> escribe en «Buscar elementos» (por clase IFC, piso o nombre); todo lo que coincide se pinta violeta y puedes asignarlo de una vez.
          <br />
          <b>Aislar:</b> oculta todo lo que no coincide con la búsqueda.
        </p>
      </>
    )
  },
  {
    id: 'groups',
    title: 'Grupos de elementos',
    icon: <Layers size={16} />,
    body: () => (
      <>
        <p className="help-lead">Un grupo es un conjunto de elementos con nombre y color, para asignarlo a varias tareas o repetirlo sin volver a seleccionar.</p>
        <div className="help-grid two">
          <div className="help-card">
            <b>Desde tu selección</b>
            <span>Selecciona piezas, pulsa «Crear grupo» y ponle nombre. Guarda exactamente esas piezas.</span>
          </div>
          <div className="help-card">
            <b>Desde una búsqueda</b>
            <span>Busca, por ejemplo, el piso «Nivel 2»; el grupo reúne todo lo que coincide y se actualiza si cambia el modelo.</span>
          </div>
        </div>
        <Steps
          items={[
            { title: 'Abre «Grupos guardados»', text: 'Segundo icono de la barra flotante del visor.' },
            { title: 'Nombre y color', text: 'Elige un nombre claro («Muros piso 1») y un color.' },
            { title: 'Úsalo', text: '«Ver» lo muestra en el modelo; «Asignar» lo pone en la tarea elegida.' }
          ]}
        />
        <Tip>Borrar un grupo lo quita también de todas las tareas que lo usaban (te pide confirmar antes).</Tip>
      </>
    )
  },
  {
    id: '4d',
    title: 'Simulación 4D',
    icon: <Flag size={16} />,
    body: () => (
      <>
        <p className="help-lead">La simulación 4D reproduce la obra: cada día el modelo muestra qué está hecho, qué se está construyendo y qué falta.</p>
        <div className="help-legend wide">
          <Swatch color="#38bdf8">Ya construido</Swatch>
          <Swatch color="#f59e0b">En construcción ese día</Swatch>
          <Swatch color="#94a3b8">Pendiente (oculto)</Swatch>
        </div>
        <Steps
          items={[
            { title: 'Activa «4D»', text: 'Botón en la barra del Visor 3D.' },
            { title: 'Reproduce o arrastra', text: 'Pulsa Reproducir o mueve la barra de tiempo.' },
            { title: 'Ocultar sin tarea', text: 'Esconde los elementos que no pertenecen a ninguna tarea.' }
          ]}
        />
        <Tip>Solo se simulan tareas con elementos asignados. Si cambias fechas en el Gantt, el rango se actualiza solo.</Tip>
      </>
    )
  },
  {
    id: 'calendar',
    title: 'Calendario y ventanas',
    icon: <CalendarDays size={16} />,
    body: () => (
      <>
        <p className="help-lead">Define los días laborables y organiza las ventanas a tu gusto.</p>
        <div className="help-grid two">
          <div className="help-card">
            <b>Calendario laboral</b>
            <span>Elige los días de la semana que se trabaja y marca los feriados. Los días no laborables se pueden ocultar del Gantt desde su menú de configuración.</span>
          </div>
          <div className="help-card">
            <b>Ventanas</b>
            <span>El icono de cuadros arriba a la derecha elige: lado a lado, uno sobre otro, visor arriba, solo Gantt o solo visor. También puedes arrastrar pestañas.</span>
          </div>
          <div className="help-card">
            <b>Configuración del Gantt</b>
            <span>Icono de ajustes en la barra del Gantt: columnas, textos en las barras, estilo de tareas padre, ocultar fines de semana.</span>
          </div>
          <div className="help-card">
            <b>Tema</b>
            <span>El sol y la luna cambian entre claro, oscuro y el del sistema.</span>
          </div>
        </div>
      </>
    )
  },
  {
    id: 'keys',
    title: 'Atajos y trucos',
    icon: <Keyboard size={16} />,
    body: () => (
      <>
        <p className="help-lead">Lo que más ahorra tiempo.</p>
        <table className="help-keys">
          <tbody>
            {[
              [<><Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></>, 'Paleta de comandos: buscar acciones y proyectos'],
              [<><Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> / <Kbd>Y</Kbd></>, 'Deshacer y rehacer en el Gantt'],
              [<>Clic en una celda</>, 'Editar en la tabla (Enter acepta, Esc cancela)'],
              [<>Clic derecho en la cabecera</>, 'Elegir las columnas visibles'],
              [<><Kbd>Ctrl</Kbd> + clic en el modelo</>, 'Sumar o quitar elementos de la selección'],
              [<><Kbd>Esc</Kbd> en el visor</>, 'Quitar la selección'],
              [<><Kbd>Ctrl</Kbd> + clic en tareas</>, 'Seleccionar varias tareas del Gantt'],
              [<>Rueda del mouse en el Gantt</>, 'Desplazar; con Ctrl, acercar o alejar el tiempo']
            ].map(([k, t], i) => (
              <tr key={i}>
                <td>{k}</td>
                <td>{t}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }
]

/** The help window; `topic` opens it on a given section. */
export default function HelpPanel({ onClose, topic }: { onClose: () => void; topic?: string }): React.JSX.Element {
  const [current, setCurrent] = useState(topic && TOPICS.some((t) => t.id === topic) ? topic : 'start')
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [current])
  const topicNow = TOPICS.find((t) => t.id === current) ?? TOPICS[0]

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="help" role="dialog" aria-label="Ayuda" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="help-nav" aria-label="Temas de ayuda">
          <div className="help-nav-title">
            <MousePointerClick size={16} /> Guía de uso
          </div>
          {TOPICS.map((t) => (
            <button key={t.id} className={`help-nav-item${t.id === current ? ' on' : ''}`} onClick={() => setCurrent(t.id)} aria-current={t.id === current}>
              {t.icon}
              {t.title}
            </button>
          ))}
        </nav>
        <div className="help-main">
          <div className="help-head">
            <h2>{topicNow.title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar la ayuda">
              <X size={16} />
            </button>
          </div>
          <div className="help-body" ref={bodyRef}>
            {topicNow.body()}
          </div>
        </div>
      </div>
    </div>
  )
}
