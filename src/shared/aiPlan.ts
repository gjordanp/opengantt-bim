import type { LinkType, ProjectData, ProjectLink, ProjectTask } from './model'

/**
 * Import a schedule written by an AI assistant: the app gives a prompt to paste into any chat,
 * and reads back the JSON the assistant answers with.
 */

export const AI_PROMPT = `Crea un cronograma de proyecto en formato JSON para importarlo a una carta Gantt. Responde SOLO con el JSON, sin explicaciones ni texto antes o después.

Estructura:
{
  "name": "Nombre del proyecto",
  "tasks": [
    { "id": 1, "text": "Obras preliminares", "start_date": "2026-03-02", "duration": 10, "progress": 0, "parent": null, "type": "project" },
    { "id": 2, "text": "Instalación de faena", "start_date": "2026-03-02", "duration": 4, "progress": 0, "parent": 1, "type": "task" },
    { "id": 3, "text": "Trazado", "start_date": "2026-03-06", "duration": 6, "progress": 0, "parent": 1, "type": "task" },
    { "id": 4, "text": "Entrega de terreno", "start_date": "2026-03-12", "duration": 0, "progress": 0, "parent": 1, "type": "milestone" }
  ],
  "links": [
    { "source": 2, "target": 3, "type": "FS", "lag": 0 },
    { "source": 3, "target": 4, "type": "FS", "lag": 0 }
  ]
}

Reglas:
- "id": números enteros únicos, desde 1.
- "start_date": fecha YYYY-MM-DD.
- "duration": días hábiles (semana de lunes a viernes), número entero. Un hito dura 0.
- "progress": avance entre 0 y 1 (0 = 0 %, 1 = 100 %).
- "parent": id de la tarea resumen que la contiene, o null si está en el nivel superior.
- "type": "project" para las tareas resumen (las que agrupan a otras), "task" para las actividades y "milestone" para los hitos.
- "links": dependencias entre actividades. "type" es "FS" (fin a inicio, la más común), "SS" (inicio a inicio), "FF" (fin a fin) o "SF" (inicio a fin). "lag" son días hábiles de espera (negativo = adelanto); omítelo si es 0.
- No vincules tareas resumen: las dependencias van entre actividades e hitos.
- Ordena las tareas en el orden en que se leen en el cronograma, con cada tarea resumen antes de sus hijas.

Descripción de mi proyecto:
`

export interface AiPlanImport {
  data: ProjectData
  /** Things in the answer that were fixed or left out. */
  warnings: string[]
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const LINK_TYPES: Record<string, LinkType> = {
  '0': '0', fs: '0', fc: '0',
  '1': '1', ss: '1', cc: '1',
  '2': '2', ff: '2', cf: '2',
  '3': '3', sf: '3', ci: '3', ic: '3'
}

/** The JSON object inside an assistant's answer: it may come in a ``` block or between sentences. */
function extractJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Pega aquí la respuesta de la IA.')
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))
  for (const c of candidates) {
    if (!c) continue
    try {
      return JSON.parse(c.trim())
    } catch {
      // try the next way of reading it
    }
  }
  throw new Error('No se pudo leer como JSON. Revisa que la respuesta esté completa (que empiece con { y termine con }).')
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : null
}

/** Reads an assistant's answer into a project; throws a message in Spanish when it can't be used. */
export function parseAiPlan(text: string): AiPlanImport {
  const root = extractJson(text)
  const obj = isObject(root) ? root : null
  const rawTasks = Array.isArray(root) ? root : (obj?.tasks ?? obj?.data)
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) throw new Error('No se encontró la lista de tareas ("tasks"). Pídele a la IA que siga la estructura indicada.')
  const rawLinks = Array.isArray(obj?.links) ? (obj.links as unknown[]) : []

  const warnings: string[] = []
  const ids = new Set<string>()
  const tasks: ProjectTask[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [i, raw] of rawTasks.entries()) {
    if (!isObject(raw)) {
      warnings.push(`La tarea ${i + 1} no tiene el formato esperado y se omitió.`)
      continue
    }
    const text = String(raw.text ?? raw.name ?? '').trim()
    if (!text) {
      warnings.push(`La tarea ${i + 1} no tiene nombre y se omitió.`)
      continue
    }
    const id = String(raw.id ?? i + 1)
    if (ids.has(id)) {
      warnings.push(`El id ${id} está repetido («${text}» se omitió).`)
      continue
    }
    ids.add(id)

    const start = validDate(raw.start_date ?? raw.start)
    if (!start) warnings.push(`«${text}» no tiene una fecha de inicio válida (YYYY-MM-DD); se usó hoy.`)
    let duration = toNumber(raw.duration)
    if (duration === null || duration < 0) {
      if (raw.duration !== undefined) warnings.push(`«${text}» tiene una duración no válida; se usó 1 día.`)
      duration = 1
    }
    let progress = toNumber(raw.progress) ?? 0
    if (progress > 1 && progress <= 100) progress /= 100
    progress = Math.min(1, Math.max(0, progress))

    const kind = String(raw.type ?? 'task').toLowerCase()
    const parentRaw = raw.parent
    const parent = parentRaw === null || parentRaw === undefined || parentRaw === '' || parentRaw === 0 || parentRaw === '0' ? '0' : String(parentRaw)
    tasks.push({
      id,
      text,
      start_date: start ?? today,
      duration: Math.round(duration),
      progress,
      parent,
      type: kind === 'project' || kind === 'summary' ? 'project' : kind === 'milestone' || duration === 0 ? 'milestone' : 'task'
    })
  }
  if (tasks.length === 0) throw new Error('No quedó ninguna tarea utilizable en la respuesta.')

  // A parent that doesn't exist becomes a top-level task; whatever has children is a summary.
  const known = new Set(tasks.map((t) => t.id))
  for (const t of tasks) {
    if (t.parent !== '0' && (!known.has(t.parent) || t.parent === t.id)) {
      warnings.push(`«${t.text}» apunta a una tarea padre que no existe; quedó en el nivel superior.`)
      t.parent = '0'
    }
  }
  const parents = new Set(tasks.map((t) => t.parent).filter((p) => p !== '0'))
  for (const t of tasks) {
    if (parents.has(t.id)) {
      t.type = 'project'
      t.open = true
    }
  }
  // Break parent loops (a → b → a) so the tree always reaches the top.
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const t of tasks) {
    const seen = new Set<string>([t.id])
    let p = t.parent
    while (p !== '0') {
      if (seen.has(p)) {
        warnings.push(`«${t.text}» formaba un ciclo de tareas padre; quedó en el nivel superior.`)
        t.parent = '0'
        break
      }
      seen.add(p)
      p = byId.get(p)?.parent ?? '0'
    }
  }

  const links: ProjectLink[] = []
  const seenLinks = new Set<string>()
  for (const raw of rawLinks) {
    if (!isObject(raw)) continue
    const source = String(raw.source ?? raw.from ?? '')
    const target = String(raw.target ?? raw.to ?? '')
    if (!known.has(source) || !known.has(target) || source === target) {
      warnings.push(`Un vínculo (${source || '?'} → ${target || '?'}) apunta a tareas que no existen y se omitió.`)
      continue
    }
    const sourceTask = byId.get(source)!
    const targetTask = byId.get(target)!
    if (sourceTask.type === 'project' || targetTask.type === 'project') {
      warnings.push(`El vínculo «${sourceTask.text}» → «${targetTask.text}» une una tarea resumen y se omitió.`)
      continue
    }
    const type = LINK_TYPES[String(raw.type ?? '0').trim().toLowerCase()]
    if (!type) warnings.push(`El vínculo «${sourceTask.text}» → «${targetTask.text}» tiene un tipo desconocido; se usó fin a inicio.`)
    const key = `${source}>${target}`
    if (seenLinks.has(key)) continue
    seenLinks.add(key)
    const lag = toNumber(raw.lag)
    links.push({ id: `l${links.length + 1}`, source, target, type: type ?? '0', ...(lag ? { lag: Math.round(lag) } : {}) })
  }

  const name = typeof obj?.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Proyecto importado con IA'
  return { data: { name, tasks, links }, warnings }
}
