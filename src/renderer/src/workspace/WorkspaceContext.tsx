import { createContext, useContext, type ReactNode } from 'react'

/** The viewer is drawn by the BimViewer component into this slot; its tools float inside it. */
export type SlotKey = 'viewer'

export interface WorkspaceCtx {
  gantt: ReactNode
  /** Buttons that act on the gantt; drawn in the gantt panel's own toolbar. */
  ganttToolbar: ReactNode
  calendar: ReactNode
  /** Planned vs real progress curve. */
  scurve: ReactNode
  setSlot: (key: SlotKey, el: HTMLElement | null) => void
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace outside a workspace')
  return ctx
}
