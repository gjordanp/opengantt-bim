import { useState } from 'react'
import GanttView from './gantt/GanttView'
import type { AutoScheduleOutcome } from './gantt/autoSchedule'
import { sampleProject } from './sampleProject'

export default function App(): React.JSX.Element {
  const [lobMode, setLobMode] = useState(false)
  const [autoScheduling, setAutoScheduling] = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [cycle, setCycle] = useState<string[]>([])

  const onScheduled = (outcome: AutoScheduleOutcome): void => {
    setCycle((prev) => (prev.join() === outcome.cycle.join() ? prev : outcome.cycle))
  }

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">Opengantt BIM · {sampleProject.name}</span>
        <button className={autoScheduling ? 'active' : ''} onClick={() => setAutoScheduling((v) => !v)}>
          Auto-schedule
        </button>
        <button className={showCritical ? 'active' : ''} onClick={() => setShowCritical((v) => !v)}>
          Ruta crítica
        </button>
        <button className={lobMode ? 'active' : ''} onClick={() => setLobMode((v) => !v)}>
          Línea de balance
        </button>
        {cycle.length > 0 && (
          <span className="warning">Dependencia circular en {cycle.length} tareas: no se programaron.</span>
        )}
      </div>
      <GanttView
        project={sampleProject}
        lobMode={lobMode}
        autoScheduling={autoScheduling}
        showCritical={showCritical}
        onScheduled={onScheduled}
      />
    </div>
  )
}
