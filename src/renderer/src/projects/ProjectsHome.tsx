import Tooltip from '../Tooltip'
import { useEffect, useRef, useState } from 'react'
import type { ProjectSummary } from '@shared/repository'
import { TEMPLATES, type TemplateId } from './templates'

interface Props {
  projects: ProjectSummary[]
  /** The project open in the workspace, if any. */
  currentId: string | null
  onOpen: (id: string) => void
  onCreate: (name: string, start: string, template: TemplateId) => void | Promise<void>
  /** Creates a project from an MS Project XML file the user picks. */
  onImportMsProject?: () => void | Promise<void>
  onRename: (id: string, name: string) => void | Promise<void>
  onDuplicate: (id: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const when = (iso: string): string => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-CL')
}

function NewProjectDialog({
  onCreate,
  onClose
}: {
  onCreate: Props['onCreate']
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [start, setStart] = useState(today())
  const [template, setTemplate] = useState<TemplateId>('building')
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(start)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    await onCreate(name.trim(), start, template)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2>Nuevo proyecto</h2>
        <label className="field">
          <span>Nombre</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Torre Los Álamos" />
        </label>
        <label className="field">
          <span>Fecha de inicio</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <div className="field">
          <span>Plantilla</span>
          <div className="template-list">
            {TEMPLATES.map((t) => (
              <label key={t.id} className={`template${template === t.id ? ' selected' : ''}`}>
                <input type="radio" name="template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                <strong>{t.label}</strong>
                <small>{t.description}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={!valid || busy}>
            {busy ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Card({
  project,
  current,
  onOpen,
  onRename,
  onDuplicate,
  onDelete
}: {
  project: ProjectSummary
  current: boolean
} & Pick<Props, 'onRename' | 'onDuplicate' | 'onDelete'> & { onOpen: () => void }): React.JSX.Element {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (renaming !== null) input.current?.select()
  }, [renaming])

  const commitRename = (): void => {
    const name = renaming?.trim()
    setRenaming(null)
    if (name && name !== project.name) void onRename(project.id, name)
  }

  return (
    <div className={`project-card${current ? ' current' : ''}`}>
      <div className="project-card-main" onDoubleClick={onOpen}>
        {renaming === null ? (
          <Tooltip label={project.name}>
            <h3>{project.name}</h3>
          </Tooltip>
        ) : (
          <input
            ref={input}
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(null)
            }}
          />
        )}
        <p>
          {project.taskCount} tareas
          {project.modelCount > 0 && ` · ${project.modelCount} ${project.modelCount === 1 ? 'modelo' : 'modelos'} BIM`}
          {project.start && ` · inicio ${project.start}`}
        </p>
        <p className="muted">Modificado {when(project.updatedAt)}</p>
      </div>
      {confirming ? (
        <div className="project-card-actions">
          <span className="danger-text">¿Eliminar «{project.name}»?</span>
          <button className="danger" onClick={() => void onDelete(project.id)}>
            Sí, eliminar
          </button>
          <button onClick={() => setConfirming(false)}>No</button>
        </div>
      ) : (
        <div className="project-card-actions">
          <button className="primary" onClick={onOpen}>
            {current ? 'Volver' : 'Abrir'}
          </button>
          <button onClick={() => setRenaming(project.name)}>Renombrar</button>
          <button onClick={() => void onDuplicate(project.id)}>Duplicar</button>
          <button onClick={() => setConfirming(true)}>Eliminar</button>
        </div>
      )}
    </div>
  )
}

export default function ProjectsHome({ projects, currentId, onOpen, onCreate, onImportMsProject, onRename, onDuplicate, onDelete }: Props): React.JSX.Element {
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const shown = projects.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Proyectos</h1>
          <p className="muted">Tus cronogramas y sus modelos BIM, guardados en este equipo.</p>
        </div>
        <div className="home-tools">
          {projects.length > 3 && (
            <input type="search" placeholder="Buscar proyecto…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          )}
          {onImportMsProject && (
            <Tooltip label="Crea un proyecto desde un archivo de MS Project guardado como XML">
              <button onClick={() => void onImportMsProject()}>Importar de MS Project…</button>
            </Tooltip>
          )}
          <button className="primary" onClick={() => setCreating(true)}>
            + Nuevo proyecto
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <h2>Aún no tienes proyectos</h2>
          <p>Crea el primero para empezar a planificar.</p>
          <button className="primary" onClick={() => setCreating(true)}>
            Crear mi primer proyecto
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {shown.map((p) => (
            <Card
              key={p.id}
              project={p}
              current={p.id === currentId}
              onOpen={() => onOpen(p.id)}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
          {shown.length === 0 && <p className="muted">Ningún proyecto coincide con «{filter}».</p>}
        </div>
      )}

      {creating && <NewProjectDialog onCreate={onCreate} onClose={() => setCreating(false)} />}
    </div>
  )
}
