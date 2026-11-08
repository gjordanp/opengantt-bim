import { Box, Check, CircleAlert, Database, Download, Loader } from 'lucide-react'
import type { DbStatus, UpdateStatus } from '@shared/api'

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

interface Props {
  db: DbStatus | null
  /** Open project, if any. */
  projectName: string | null
  modelCount: number
  elementCount: number
  saveState: SaveState
  update: UpdateStatus
}

const SAVE_TEXT: Record<Exclude<SaveState, 'idle'>, string> = {
  pending: 'Guardando…',
  saved: 'Guardado',
  error: 'Error al guardar'
}

/** The thin strip at the bottom: connection, what's open, and what is being saved or updated. */
export default function StatusBar({ db, projectName, modelCount, elementCount, saveState, update }: Props): React.JSX.Element {
  const dbText = !db ? 'Conectando…' : db.connected ? (db.settings.mode === 'external' ? 'MongoDB externo' : 'Base de datos local') : 'Sin base de datos'
  const dbClass = !db ? 'pending' : db.connected ? 'ok' : 'error'

  return (
    <div className="statusbar" role="status">
      <span className={`status-item db ${dbClass}`}>
        <Database size={12} aria-hidden />
        {dbText}
      </span>
      {projectName && <span className="status-item strong">{projectName}</span>}
      {projectName && (
        <span className="status-item">
          <Box size={12} aria-hidden />
          {modelCount} {modelCount === 1 ? 'modelo' : 'modelos'} · {elementCount.toLocaleString('es-CL')} elementos
        </span>
      )}
      <span className="status-spacer" />
      {update.state === 'downloading' && (
        <span className="status-item">
          <Download size={12} aria-hidden />
          Descargando actualización {update.percent ?? 0}%
        </span>
      )}
      {update.state === 'ready' && (
        <span className="status-item">
          <Download size={12} aria-hidden />
          Actualización v{update.version} lista
        </span>
      )}
      {saveState !== 'idle' && (
        <span className={`status-item save ${saveState}`}>
          {saveState === 'pending' && <Loader size={12} aria-hidden className="spin" />}
          {saveState === 'saved' && <Check size={12} aria-hidden />}
          {saveState === 'error' && <CircleAlert size={12} aria-hidden />}
          {SAVE_TEXT[saveState]}
        </span>
      )}
    </div>
  )
}
