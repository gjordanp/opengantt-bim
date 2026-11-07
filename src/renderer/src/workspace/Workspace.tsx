import { useCallback, useMemo } from 'react'
import { DockviewReact, themeLight, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
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
      onReady={onReady}
      defaultRenderer="always"
      noPanelsOverlay="watermark"
    />
  )
}
