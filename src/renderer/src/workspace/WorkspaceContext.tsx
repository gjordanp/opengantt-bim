import { createContext, useContext, type ReactNode } from 'react'

/** The BIM panels are drawn by the viewer component through these slots. */
export type SlotKey = 'viewer' | 'props' | 'models' | 'task' | 'groups'

export interface WorkspaceCtx {
  gantt: ReactNode
  calendar: ReactNode
  setSlot: (key: SlotKey, el: HTMLElement | null) => void
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace outside a workspace')
  return ctx
}
