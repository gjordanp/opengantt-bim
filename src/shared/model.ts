/** Dependency types, matching the gantt library: FS=0, SS=1, FF=2, SF=3. */
export type LinkType = '0' | '1' | '2' | '3'

export interface ProjectTask {
  id: string
  text: string
  /** `YYYY-MM-DD` */
  start_date: string
  /** Duration in days */
  duration: number
  /** 0..1 */
  progress: number
  /** Parent task id, or `0` for a root task */
  parent: string
  type?: 'task' | 'project' | 'milestone'
  open?: boolean
  /** Surface (m²) of the location this activity covers; drives line-of-balance row height */
  location_surface?: number
  /** Planned dates (baseline), `YYYY-MM-DD`; the end is exclusive like the task's own end. Both or neither. */
  baseline_start?: string
  baseline_end?: string
  /** Last day the task may work, `YYYY-MM-DD`. */
  deadline?: string
  /** `asap` (default, not stored), `alap`, `snet`, `snlt`, `fnet`, `fnlt`, `mso` or `mfo`. */
  constraint_type?: string
  /** `YYYY-MM-DD`; for the finish constraints (`fnet`, `fnlt`, `mfo`) it is the last day of work. */
  constraint_date?: string
}

export interface ProjectLink {
  id: string
  source: string
  target: string
  type: LinkType
  /** Lag in days (negative = lead) */
  lag?: number
}

export interface ProjectData {
  name: string
  /** BIM groups and the tasks they are assigned to. */
  bim?: import('./bimGroups').BimData
  /** Non-working days, `YYYY-MM-DD`. */
  holidays?: string[]
  /** Working weekdays, 0=Sunday..6=Saturday. Defaults to Mon-Fri. */
  workWeek?: number[]
  tasks: ProjectTask[]
  links: ProjectLink[]
}
