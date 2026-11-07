import { useCallback, useMemo, useState } from 'react'
import { DockviewReact, themeLight, type IDockviewHeaderActionsProps, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { applyPreset, restoreLayout, saveLayout } from './layout'
import { useWorkspace, type SlotKey } from './WorkspaceContext'

function GanttPanel(): React.JSX.Element {
  return <div className="panel-fill">{useWorkspace().gantt}</div>
}

function CalendarPanelHost(): React.JSX.Element {
  return <div className="panel-fill panel-scroll">{useWorkspace().calendar}</div>
}

/** A panel whose content is drawn elsewhere (by BimViewer) into this element. */
function slotPanel(key: SlotKey): (p: IDockviewPanelProps) => React.JSX.Element {
  return function SlotPanel(): React.JSX.Element {
    const { setSlot } = useWorkspace()
    const ref = useCallback((el: HTMLDivElement | null) => setSlot(key, el), [setSlot])
    return <div className={`panel-fill slot-${key}`} ref={ref} />
  }
}

const components = {
  gantt: GanttPanel,
  calendar: CalendarPanelHost,
  viewer: slotPanel('viewer'),
  props: slotPanel('props'),
  models: slotPanel('models'),
  task: slotPanel('task'),
  groups: slotPanel('groups')
}

/** Moves a group's tabs between the top edge and the left edge (a column of tabs saves height). */
function HeaderActions({ group }: IDockviewHeaderActionsProps): React.JSX.Element {
  const [position, setPosition] = useState(group.api.getHeaderPosition())
  const side = position === 'left'
  return (
    <button
      className="hdr-btn"
      title={side ? 'Pestañas arriba' : 'Pestañas a la izquierda (gana altura)'}
      onClick={() => {
        const next = side ? 'top' : 'left'
        group.api.setHeaderPosition(next)
        setPosition(next)
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" />
        {side ? <line x1="1.5" y1="4.5" x2="12.5" y2="4.5" stroke="currentColor" /> : <line x1="4.5" y1="1.5" x2="4.5" y2="12.5" stroke="currentColor" />}
      </svg>
    </button>
  )
}

export default function Workspace({ onApi }: { onApi: (api: DockviewApi) => void }): React.JSX.Element {
  const onReady = useMemo(
    () =>
      (event: DockviewReadyEvent): void => {
        const api = event.api
        if (!restoreLayout(api)) applyPreset(api, 'classic')
        let timer: number | undefined
        api.onDidLayoutChange(() => {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => saveLayout(api), 400)
        })
        onApi(api)
      },
    [onApi]
  )
  return (
    <DockviewReact
      className="dockview-theme-og"
      theme={themeLight}
      components={components}
      rightHeaderActionsComponent={HeaderActions}
      onReady={onReady}
      defaultRenderer="always"
      noPanelsOverlay="watermark"
    />
  )
}
