import type { ProjectData } from '@shared/model'
import { sampleProject } from '../sampleProject'

export type TemplateId = 'blank' | 'building'

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: 'blank', label: 'En blanco', description: 'Un proyecto vacío con una primera tarea para empezar.' },
  {
    id: 'building',
    label: 'Edificio (plantilla)',
    description: 'Obras preliminares, obra gruesa y terminaciones, con dependencias y superficies para la línea de balance.'
  }
]

const DAY = 86_400_000

/** Moves a `YYYY-MM-DD` date by a number of days (calendar days, UTC so DST never shifts it). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10)
}

const daysBetween = (from: string, to: string): number => {
  const parse = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(to) - parse(from)) / DAY)
}

/** Tasks and links for a new project that starts on `start` (`YYYY-MM-DD`). */
export function buildTemplate(template: TemplateId, name: string, start: string): Pick<ProjectData, 'tasks' | 'links'> {
  if (template === 'blank') {
    return {
      tasks: [
        { id: '1', text: name, start_date: start, duration: 10, progress: 0, parent: '0', type: 'project', open: true },
        { id: '2', text: 'Primera tarea', start_date: start, duration: 5, progress: 0, parent: '1' }
      ],
      links: []
    }
  }
  const first = sampleProject.tasks.reduce((min, t) => (t.start_date < min ? t.start_date : min), sampleProject.tasks[0].start_date)
  const delta = daysBetween(first, start)
  return {
    tasks: sampleProject.tasks.map((t, i) => ({
      ...t,
      text: i === 0 ? name : t.text,
      start_date: shiftDate(t.start_date, delta),
      progress: 0
    })),
    links: sampleProject.links.map((l) => ({ ...l }))
  }
}
