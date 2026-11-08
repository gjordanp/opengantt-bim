/**
 * MS Project XML (MSPDI): reading a project saved with "Save as XML" and writing one MS Project can open.
 *
 * The app's model is simpler than Project's (one calendar, durations in working days, no constraints,
 * resources or costs), so reading is lossy on purpose; what could not be kept is reported as warnings.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import type { LinkType, ProjectData, ProjectLink, ProjectTask } from './model'
import { endFromStart, fromDay, prevWorkingDay, toDay, weekCalendar } from './scheduling'

export interface MspdiImport {
  data: ProjectData
  /** Things in the file that the app cannot represent. */
  warnings: string[]
}

const NS = 'http://schemas.microsoft.com/project'
const DEFAULT_MINUTES_PER_DAY = 480
const MAX_EXCEPTION_DAYS = 400

// MSPDI link types: 0=FF, 1=FS, 2=SF, 3=SS. The app's: FS=0, SS=1, FF=2, SF=3.
const FROM_MSPDI: Record<string, LinkType> = { '0': '2', '1': '0', '2': '3', '3': '1' }
const TO_MSPDI: Record<LinkType, number> = { '0': 1, '1': 3, '2': 0, '3': 2 }

type Node = Record<string, unknown>

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown): number => {
  const n = Number.parseFloat(str(v))
  return Number.isFinite(n) ? n : NaN
}

/** `PT40H0M0S` → hours. Days in the designator (rare) count as 24 h. */
export function parseDurationHours(value: unknown): number {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(str(value))
  if (!m) return 0
  return Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60 + Number(m[4] ?? 0) / 3600
}

function isoDatesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const start = toDay(from)
  const end = Math.min(toDay(to), start + MAX_EXCEPTION_DAYS - 1)
  for (let d = start; d <= end; d++) out.push(fromDay(d))
  return out
}

interface ReadCalendar {
  workWeek: number[]
  holidays: string[]
  workingExceptions: number
  recurring: number
}

function readCalendar(root: Node): ReadCalendar {
  const calendars = asArray(((root['Calendars'] as Node | undefined)?.['Calendar'] as Node | Node[] | undefined))
  const wanted = str(root['CalendarUID'])
  const cal =
    calendars.find((c) => str(c['UID']) === wanted) ?? calendars.find((c) => str(c['IsBaselineCalendar']) === '1') ?? calendars[0]
  const result: ReadCalendar = { workWeek: [1, 2, 3, 4, 5], holidays: [], workingExceptions: 0, recurring: 0 }
  if (!cal) return result

  const days = asArray(((cal['WeekDays'] as Node | undefined)?.['WeekDay'] as Node | Node[] | undefined))
  const week = new Set<number>()
  let sawWeekday = false
  const exceptions: Node[] = []
  for (const d of days) {
    const type = Number(str(d['DayType']))
    if (type >= 1 && type <= 7) {
      sawWeekday = true
      if (str(d['DayWorking']) !== '0') week.add(type - 1)
    } else if (type === 0) {
      exceptions.push(d) // older files keep exceptions as DayType 0
    }
  }
  if (sawWeekday && week.size > 0) result.workWeek = [...week].sort((a, b) => a - b)

  exceptions.push(...asArray(((cal['Exceptions'] as Node | undefined)?.['Exception'] as Node | Node[] | undefined)))
  const off = new Set<string>()
  for (const e of exceptions) {
    const period = e['TimePeriod'] as Node | undefined
    const from = str(period?.['FromDate']).slice(0, 10)
    const to = str(period?.['ToDate']).slice(0, 10) || from
    if (!from) continue
    if (Number(str(e['Occurrences'])) > 1) result.recurring++
    if (str(e['DayWorking']) === '0') for (const iso of isoDatesBetween(from, to)) off.add(iso)
    else result.workingExceptions++
  }
  result.holidays = [...off].sort()
  return result
}

/** Reads an MSPDI document. Throws if the text is not an MS Project XML file. */
export function parseMspdi(xml: string): MspdiImport {
  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => ['Task', 'WeekDay', 'PredecessorLink', 'Exception', 'Calendar'].includes(name)
  })
  let root: Node | undefined
  try {
    root = (parser.parse(xml.replace(/^﻿/, '')) as { Project?: Node }).Project
  } catch {
    root = undefined
  }
  if (!root || typeof root !== 'object') throw new Error('El archivo no es un proyecto de MS Project guardado como XML.')

  const warnings: string[] = []
  const minutesPerDay = num(root['MinutesPerDay']) > 0 ? num(root['MinutesPerDay']) : DEFAULT_MINUTES_PER_DAY
  const calendar = readCalendar(root)
  if (calendar.workingExceptions > 0) warnings.push(`${calendar.workingExceptions} días laborables en fines de semana o excepciones no se importan (el calendario es único y semanal).`)
  if (calendar.recurring > 0) warnings.push(`${calendar.recurring} excepciones de calendario recurrentes se importan solo en su primera fecha.`)

  const projectStart = str(root['StartDate']).slice(0, 10)
  const tasks: ProjectTask[] = []
  const idByUid = new Map<string, string>()
  const used = new Set<string>()
  const preds: { target: string; uid: string; type: string; lag: number }[] = []
  const stack: { level: number; id: string }[] = []
  let constrained = 0

  for (const el of asArray(((root['Tasks'] as Node | undefined)?.['Task'] as Node | Node[] | undefined))) {
    if (str(el['IsNull']) === '1') continue
    const uid = str(el['UID'])
    let id = uid === '0' ? 'p0' : uid
    while (!id || used.has(id)) id = `${id || 't'}_${used.size}`
    used.add(id)
    idByUid.set(uid, id)

    const level = Number.parseInt(str(el['OutlineLevel']), 10) || 1
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack.length > 0 ? stack[stack.length - 1].id : '0'
    stack.push({ level, id })

    const milestone = str(el['Milestone']) === '1'
    const summary = str(el['Summary']) === '1'
    const hours = parseDurationHours(el['Duration'])
    const days = (hours * 60) / minutesPerDay
    const duration = milestone ? 0 : days > 0 ? Math.max(1, Math.round(days)) : 0
    const start = str(el['Start']).slice(0, 10) || projectStart || new Date().toISOString().slice(0, 10)
    const percent = num(el['PercentComplete'])

    const task: ProjectTask = {
      id,
      text: str(el['Name']) || `Tarea ${uid}`,
      start_date: start,
      duration,
      progress: Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : 0,
      parent
    }
    if (milestone) task.type = 'milestone'
    else if (summary) {
      task.type = 'project'
      task.open = true
    }
    tasks.push(task)

    const constraint = str(el['ConstraintType'])
    if (constraint && constraint !== '0') constrained++
    for (const p of asArray(el['PredecessorLink'] as Node | Node[] | undefined)) {
      const lagTenths = num(p['LinkLag'])
      preds.push({
        target: id,
        uid: str(p['PredecessorUID']),
        type: str(p['Type']) || '1',
        lag: Number.isFinite(lagTenths) ? Math.round(lagTenths / 10 / minutesPerDay) : 0
      })
    }
  }
  if (constrained > 0) warnings.push(`${constrained} tareas tenían restricciones de fecha, que no se importan.`)

  const summaryIds = new Set(tasks.filter((t) => tasks.some((c) => c.parent === t.id)).map((t) => t.id))
  const links: ProjectLink[] = []
  let dropped = 0
  let onSummaries = 0
  for (const p of preds) {
    const source = idByUid.get(p.uid)
    if (!source) {
      dropped++
      continue
    }
    if (summaryIds.has(source) || summaryIds.has(p.target)) onSummaries++
    const link: ProjectLink = { id: `l${links.length + 1}`, source, target: p.target, type: FROM_MSPDI[p.type] ?? '0' }
    if (p.lag !== 0) link.lag = p.lag
    links.push(link)
  }
  if (dropped > 0) warnings.push(`${dropped} vínculos apuntaban a tareas que no existen y se omitieron.`)
  if (onSummaries > 0) warnings.push(`${onSummaries} vínculos tocan tareas resumen; el motor de planificación solo usa los vínculos entre tareas de detalle.`)

  const name = str(root['Title']) || str(root['Name']) || 'Proyecto importado'
  return { data: { name, tasks, links, holidays: calendar.holidays, workWeek: calendar.workWeek }, warnings }
}

// ---------------------------------------------------------------- writing

const stamp = (iso: string, time: string): string => `${iso.slice(0, 10)}T${time}`

/** Tasks in outline order (parents before their children, siblings in file order), with their depth. */
function outline(tasks: ProjectTask[]): { task: ProjectTask; level: number; wbs: string }[] {
  const children = new Map<string, ProjectTask[]>()
  const ids = new Set(tasks.map((t) => t.id))
  for (const t of tasks) {
    const key = ids.has(t.parent) ? t.parent : '0'
    const list = children.get(key)
    if (list) list.push(t)
    else children.set(key, [t])
  }
  const out: { task: ProjectTask; level: number; wbs: string }[] = []
  const seen = new Set<string>()
  const walk = (parent: string, level: number, prefix: string): void => {
    ;(children.get(parent) ?? []).forEach((task, i) => {
      if (seen.has(task.id)) return
      seen.add(task.id)
      const wbs = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      out.push({ task, level, wbs })
      walk(task.id, level + 1, wbs)
    })
  }
  walk('0', 1, '')
  return out
}

function runsOfDays(isoDates: string[]): [string, string][] {
  const days = [...new Set(isoDates.map(toDay))].sort((a, b) => a - b)
  const runs: [string, string][] = []
  for (const d of days) {
    const last = runs[runs.length - 1]
    if (last && toDay(last[1]) + 1 === d) last[1] = fromDay(d)
    else runs.push([fromDay(d), fromDay(d)])
  }
  return runs
}

/** Writes the project as MSPDI XML that MS Project can open. */
export function buildMspdi(data: ProjectData): string {
  const workWeek = data.workWeek && data.workWeek.length > 0 ? data.workWeek : [1, 2, 3, 4, 5]
  const holidays = data.holidays ?? []
  const cal = weekCalendar({ workWeek, holidays })
  const ordered = outline(data.tasks)
  const uidOf = new Map(ordered.map((o, i) => [o.task.id, i + 1]))

  const dates = data.tasks.map((t) => t.start_date.slice(0, 10)).sort()
  const first = dates[0] ?? new Date().toISOString().slice(0, 10)

  const taskNodes = ordered.map(({ task, level, wbs }, i) => {
    const summary = task.type === 'project' || data.tasks.some((c) => c.parent === task.id)
    const milestone = task.type === 'milestone' || (task.duration === 0 && !summary)
    const duration = milestone ? 0 : Math.max(0, Math.round(task.duration))
    const startIso = task.start_date.slice(0, 10)
    const finishIso = duration > 0 ? fromDay(prevWorkingDay(cal, endFromStart(cal, toDay(startIso), duration) - 1)) : startIso
    const node: Node = {
      UID: String(i + 1),
      ID: String(i + 1),
      Name: task.text,
      Type: '0',
      IsNull: '0',
      WBS: wbs,
      OutlineNumber: wbs,
      OutlineLevel: String(level),
      Priority: '500',
      Start: stamp(startIso, '08:00:00'),
      Finish: stamp(finishIso, milestone ? '08:00:00' : '17:00:00'),
      Duration: `PT${duration * 8}H0M0S`,
      DurationFormat: '7',
      Milestone: milestone ? '1' : '0',
      Summary: summary ? '1' : '0',
      PercentComplete: String(Math.round(Math.min(1, Math.max(0, task.progress)) * 100))
    }
    const links = data.links.filter((l) => l.target === task.id && uidOf.has(l.source))
    if (links.length > 0) {
      node['PredecessorLink'] = links.map((l) => ({
        PredecessorUID: String(uidOf.get(l.source)),
        Type: String(TO_MSPDI[l.type] ?? 1),
        CrossProject: '0',
        LinkLag: String(Math.round((l.lag ?? 0) * DEFAULT_MINUTES_PER_DAY * 10)),
        LagFormat: '7'
      }))
    }
    return node
  })

  const weekDays = [1, 2, 3, 4, 5, 6, 7].map((dayType) => {
    const working = workWeek.includes(dayType - 1)
    const day: Node = { DayType: String(dayType), DayWorking: working ? '1' : '0' }
    if (working) {
      day['WorkingTimes'] = {
        WorkingTime: [
          { FromTime: '08:00:00', ToTime: '12:00:00' },
          { FromTime: '13:00:00', ToTime: '17:00:00' }
        ]
      }
    }
    return day
  })
  const runs = runsOfDays(holidays)
  const calendar: Node = {
    UID: '1',
    Name: 'Estándar',
    IsBaseCalendar: '1',
    IsBaselineCalendar: '0',
    BaseCalendarUID: '-1',
    WeekDays: { WeekDay: weekDays }
  }
  if (runs.length > 0) {
    calendar['Exceptions'] = {
      Exception: runs.map(([from, to]) => ({
        EnteredByOccurrences: '0',
        TimePeriod: { FromDate: stamp(from, '00:00:00'), ToDate: stamp(to, '23:59:00') },
        Occurrences: '1',
        Name: 'Feriado',
        Type: '1',
        DayWorking: '0'
      }))
    }
  }

  const doc = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8', '@_standalone': 'yes' },
    Project: {
      '@_xmlns': NS,
      SaveVersion: '14',
      Name: `${data.name}.xml`,
      Title: data.name,
      CreationDate: new Date().toISOString().slice(0, 19),
      ScheduleFromStart: '1',
      StartDate: stamp(first, '08:00:00'),
      CalendarUID: '1',
      DefaultStartTime: '08:00:00',
      DefaultFinishTime: '17:00:00',
      MinutesPerDay: String(DEFAULT_MINUTES_PER_DAY),
      MinutesPerWeek: String(DEFAULT_MINUTES_PER_DAY * workWeek.length),
      DaysPerMonth: '20',
      DefaultTaskType: '0',
      DurationFormat: '7',
      WorkFormat: '2',
      Calendars: { Calendar: [calendar] },
      Tasks: { Task: taskNodes }
    }
  }
  return new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressEmptyNode: false }).build(doc) as string
}
