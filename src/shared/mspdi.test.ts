import { describe, expect, it } from 'vitest'
import type { ProjectData } from './model'
import { buildMspdi, parseDurationHours, parseMspdi } from './mspdi'

const sample: ProjectData = {
  name: 'Torre & Cía <demo>',
  workWeek: [1, 2, 3, 4, 5],
  holidays: ['2026-01-01', '2026-04-03', '2026-04-04', '2026-04-05'],
  tasks: [
    { id: 'a', text: 'Edificio', start_date: '2026-01-05', duration: 40, progress: 0.25, parent: '0', type: 'project', open: true },
    { id: 'b', text: 'Excavación', start_date: '2026-01-05', duration: 10, progress: 1, parent: 'a' },
    { id: 'c', text: 'Fundaciones', start_date: '2026-01-19', duration: 15, progress: 0.5, parent: 'a' },
    { id: 'd', text: 'Hito: entrega de terreno', start_date: '2026-01-19', duration: 0, progress: 0, parent: 'a', type: 'milestone' },
    { id: 'e', text: 'Terminaciones', start_date: '2026-03-02', duration: 20, progress: 0, parent: 'a', type: 'project', open: true },
    { id: 'f', text: 'Pintura', start_date: '2026-03-02', duration: 12, progress: 0, parent: 'e' }
  ],
  links: [
    { id: 'l1', source: 'b', target: 'c', type: '0' },
    { id: 'l2', source: 'c', target: 'f', type: '1', lag: 3 },
    { id: 'l3', source: 'b', target: 'd', type: '2', lag: -2 },
    { id: 'l4', source: 'd', target: 'f', type: '3' }
  ]
}

/** Tasks by name, so comparisons don't depend on the ids the importer makes up. */
function shape(data: ProjectData): unknown {
  const nameOf = new Map(data.tasks.map((t) => [t.id, t.text]))
  return {
    tasks: data.tasks.map((t) => ({
      text: t.text,
      start: t.start_date,
      duration: t.duration,
      progress: t.progress,
      parent: nameOf.get(t.parent) ?? null,
      type: t.type ?? 'task'
    })),
    links: data.links.map((l) => ({ from: nameOf.get(l.source), to: nameOf.get(l.target), type: l.type, lag: l.lag ?? 0 }))
  }
}

describe('MSPDI round trip', () => {
  it('reads back what it wrote: tasks, hierarchy, links, calendar and name', () => {
    const { data, warnings } = parseMspdi(buildMspdi(sample))
    expect(warnings).toEqual([])
    expect(data.name).toBe(sample.name)
    expect(data.workWeek).toEqual([1, 2, 3, 4, 5])
    expect(data.holidays).toEqual(sample.holidays)
    const original = shape(sample) as { tasks: unknown[]; links: unknown[] }
    const back = shape(data) as { tasks: unknown[]; links: unknown[] }
    // The importer marks plain tasks without a type; everything else must match.
    expect(back.tasks).toEqual(original.tasks)
    // Links come back grouped by successor, so compare them regardless of order.
    const key = (x: unknown): string => JSON.stringify(x)
    expect(back.links.map(key).sort()).toEqual(original.links.map(key).sort())
  })

  it('keeps a six-day week', () => {
    const six = { ...sample, workWeek: [1, 2, 3, 4, 5, 6], holidays: [] }
    expect(parseMspdi(buildMspdi(six)).data.workWeek).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('writes the MSPDI link type numbers (FF=0, FS=1, SF=2, SS=3)', () => {
    const xml = buildMspdi(sample)
    const types = [...xml.matchAll(/<Type>(\d)<\/Type>\s*<CrossProject>/g)].map((m) => m[1])
    // sample links: FS→1, SS→3, FF→0, SF→2
    expect(types.sort()).toEqual(['0', '1', '2', '3'])
  })

  it('writes an outline MS Project understands', () => {
    const xml = buildMspdi(sample)
    expect(xml).toContain('xmlns="http://schemas.microsoft.com/project"')
    expect(xml).toMatch(/<OutlineLevel>3<\/OutlineLevel>/)
    expect(xml).toContain('<Duration>PT120H0M0S</Duration>')
    // Excavación: 10 working days from Monday 2026-01-05 finish on Friday 2026-01-16.
    expect(xml).toContain('<Finish>2026-01-16T17:00:00</Finish>')
  })

  it('escapes special characters in names', () => {
    const xml = buildMspdi(sample)
    expect(xml).not.toContain('Torre & Cía')
    expect(parseMspdi(xml).data.name).toBe('Torre & Cía <demo>')
  })

  it('handles an empty project', () => {
    const empty = parseMspdi(buildMspdi({ name: 'Vacío', tasks: [], links: [] })).data
    expect(empty.tasks).toEqual([])
    expect(empty.links).toEqual([])
  })
})

const mspdi = (body: string, header = ''): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>x.xml</Name><Title>Hecho en Project</Title>${header}${body}</Project>`

describe('reading files made by MS Project', () => {
  it('converts durations with the project hours per day and drops IsNull rows', () => {
    const xml = mspdi(
      `<Tasks>
        <Task><UID>0</UID><ID>0</ID><Name>Hecho en Project</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary><Start>2026-02-02T08:00:00</Start><Duration>PT30H0M0S</Duration></Task>
        <Task><UID>1</UID><Name>Vacía</Name><IsNull>1</IsNull></Task>
        <Task><UID>2</UID><Name>Tarea corta</Name><OutlineLevel>1</OutlineLevel><Start>2026-02-02T09:00:00</Start><Duration>PT30H0M0S</Duration><PercentComplete>40</PercentComplete></Task>
      </Tasks>`,
      '<MinutesPerDay>360</MinutesPerDay>'
    )
    const { data } = parseMspdi(xml)
    expect(data.name).toBe('Hecho en Project')
    expect(data.tasks.map((t) => t.text)).toEqual(['Hecho en Project', 'Tarea corta'])
    const short = data.tasks[1]
    expect(short.duration).toBe(5) // 30 h at 6 h/day
    expect(short.start_date).toBe('2026-02-02')
    expect(short.progress).toBeCloseTo(0.4)
  })

  it('rebuilds the hierarchy from OutlineLevel, including deep and out-of-order levels', () => {
    const t = (uid: number, level: number, summary = 0): string =>
      `<Task><UID>${uid}</UID><Name>T${uid}</Name><OutlineLevel>${level}</OutlineLevel><Summary>${summary}</Summary><Start>2026-01-05T08:00:00</Start><Duration>PT8H0M0S</Duration></Task>`
    const { data } = parseMspdi(mspdi(`<Tasks>${t(1, 1, 1)}${t(2, 2, 1)}${t(3, 3)}${t(4, 3)}${t(5, 2)}${t(6, 1)}</Tasks>`))
    const parentOf = Object.fromEntries(data.tasks.map((x) => [x.text, data.tasks.find((p) => p.id === x.parent)?.text ?? '0']))
    expect(parentOf).toEqual({ T1: '0', T2: 'T1', T3: 'T2', T4: 'T2', T5: 'T1', T6: '0' })
    expect(data.tasks.find((x) => x.text === 'T2')?.type).toBe('project')
  })

  it('maps link types and converts lag from tenths of a minute to days', () => {
    const task = (uid: number, preds = ''): string =>
      `<Task><UID>${uid}</UID><Name>T${uid}</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Duration>PT8H0M0S</Duration>${preds}</Task>`
    const link = (uid: number, type: number, lag: number): string => `<PredecessorLink><PredecessorUID>${uid}</PredecessorUID><Type>${type}</Type><LinkLag>${lag}</LinkLag></PredecessorLink>`
    const xml = mspdi(
      `<Tasks>${task(1)}${task(2, link(1, 1, 0))}${task(3, link(1, 3, 9600))}${task(4, link(1, 0, -4800))}${task(5, link(1, 2, 0))}${task(6, link(99, 1, 0))}</Tasks>`
    )
    const { data, warnings } = parseMspdi(xml)
    const byTarget = Object.fromEntries(data.links.map((l) => [l.target, l]))
    expect(byTarget['2'].type).toBe('0') // FS
    expect(byTarget['3']).toMatchObject({ type: '1', lag: 2 }) // SS, 2 days
    expect(byTarget['4']).toMatchObject({ type: '2', lag: -1 }) // FF, a one-day lead
    expect(byTarget['5'].type).toBe('3') // SF
    expect(byTarget['6']).toBeUndefined() // points to a task that does not exist
    expect(warnings.join(' ')).toContain('no existen')
  })

  it('reads the base calendar: working week and non-working exceptions as holidays', () => {
    const calendar = `<Calendars><Calendar><UID>1</UID><Name>Estándar</Name><IsBaselineCalendar>1</IsBaselineCalendar><WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>1</DayWorking></WeekDay>
      </WeekDays><Exceptions>
        <Exception><TimePeriod><FromDate>2026-05-01T00:00:00</FromDate><ToDate>2026-05-03T23:59:00</ToDate></TimePeriod><DayWorking>0</DayWorking></Exception>
        <Exception><TimePeriod><FromDate>2026-06-07T00:00:00</FromDate><ToDate>2026-06-07T23:59:00</ToDate></TimePeriod><DayWorking>1</DayWorking></Exception>
      </Exceptions></Calendar></Calendars>`
    const { data, warnings } = parseMspdi(mspdi('<Tasks></Tasks>', `<CalendarUID>1</CalendarUID>${calendar}`))
    expect(data.workWeek).toEqual([1, 2, 3, 4, 5, 6]) // Saturday works in this calendar
    expect(data.holidays).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect(warnings.join(' ')).toContain('1 días laborables')
  })

  it('reports date constraints it cannot keep', () => {
    const xml = mspdi(
      '<Tasks><Task><UID>1</UID><Name>Con restricción</Name><OutlineLevel>1</OutlineLevel><ConstraintType>4</ConstraintType><Start>2026-01-05T08:00:00</Start><Duration>PT8H0M0S</Duration></Task></Tasks>'
    )
    expect(parseMspdi(xml).warnings.join(' ')).toContain('restricciones')
  })

  it('tolerates a byte-order mark and rejects text that is not an MS Project file', () => {
    expect(parseMspdi('﻿' + mspdi('<Tasks></Tasks>')).data.tasks).toEqual([])
    expect(() => parseMspdi('<html></html>')).toThrow(/MS Project/)
    expect(() => parseMspdi('not xml at all')).toThrow(/MS Project/)
  })
})

describe('parseDurationHours', () => {
  it('reads hours, minutes and seconds', () => {
    expect(parseDurationHours('PT40H0M0S')).toBe(40)
    expect(parseDurationHours('PT1H30M0S')).toBe(1.5)
    expect(parseDurationHours('PT0H0M0S')).toBe(0)
    expect(parseDurationHours('garbage')).toBe(0)
  })
})
