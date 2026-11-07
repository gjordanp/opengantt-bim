import { useState } from 'react'
import GanttView from './gantt/GanttView'
import { sampleProject } from './sampleProject'

export default function App(): React.JSX.Element {
  const [lobMode, setLobMode] = useState(false)

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">Opengantt BIM · {sampleProject.name}</span>
        <button className={lobMode ? 'active' : ''} onClick={() => setLobMode((v) => !v)}>
          Línea de balance
        </button>
      </div>
      <GanttView project={sampleProject} lobMode={lobMode} />
    </div>
  )
}
