import { describe, expect, it } from 'vitest'
import {
  allDays,
  endFromStart,
  fromDay,
  schedule,
  shiftWorkDays,
  startFromEnd,
  toDay,
  weekCalendar,
  weekday,
  type SchedLink,
  type SchedTask
} from './index'

// 2026-01-05 is a Monday, so Jan 5-9 is a working week, Jan 10-11 the weekend.
const cal = weekCalendar()
const d = toDay

const task = (id: string, start: string, duration: number, parent?: string): SchedTask => ({ id, start, duration, parent })
const link = (source: string, target: string, type: SchedLink['type'] = '0', lag?: number): SchedLink => ({ source, target, type, lag })
const dates = (r: ReturnType<typeof schedule>, id: string): [string, string] => [r.tasks.get(id)!.start, r.tasks.get(id)!.end]

describe('calendar', () => {
  it('round-trips dates and finds the weekday', () => {
    expect(fromDay(toDay('2026-01-05'))).toBe('2026-01-05')
    expect(weekday(toDay('2026-01-05'))).toBe(1)
    expect(weekday(toDay('1970-01-01'))).toBe(4)
    expect(weekday(toDay('1969-12-31'))).toBe(3)
  })

  it('computes exclusive ends over working days', () => {
    expect(fromDay(endFromStart(cal, d('2026-01-05'), 3))).toBe('2026-01-08')
    // Thu + Fri, so the exclusive end is the Saturday.
    expect(fromDay(endFromStart(cal, d('2026-01-08'), 2))).toBe('2026-01-10')
    // Starting on a weekend begins on Monday.
    expect(fromDay(endFromStart(cal, d('2026-01-10'), 1))).toBe('2026-01-13')
    expect(fromDay(endFromStart(cal, d('2026-01-05'), 0))).toBe('2026-01-05')
  })

  it('computes starts backwards from an end', () => {
    expect(fromDay(startFromEnd(cal, d('2026-01-10'), 2))).toBe('2026-01-08')
    expect(fromDay(startFromEnd(cal, d('2026-01-13'), 1))).toBe('2026-01-12')
  })

  it('shifts by working-day lags in both directions', () => {
    expect(fromDay(shiftWorkDays(cal, d('2026-01-10'), 1))).toBe('2026-01-13')
    expect(fromDay(shiftWorkDays(cal, d('2026-01-10'), -1))).toBe('2026-01-09')
    expect(shiftWorkDays(cal, d('2026-01-10'), 0)).toBe(d('2026-01-10'))
  })

  it('honours holidays', () => {
    const withHoliday = weekCalendar({ holidays: ['2026-01-06'] })
    // Mon, (Tue off), Wed -> 2 days end after Wed.
    expect(fromDay(endFromStart(withHoliday, d('2026-01-05'), 2))).toBe('2026-01-08')
  })

  it('rejects a calendar with no working weekday', () => {
    expect(() => weekCalendar({ workWeek: [] })).toThrow()
  })
})

describe('schedule: dependencies', () => {
  it('finish-to-start puts the successor right after the predecessor', () => {
    const r = schedule([task('A', '2026-01-05', 3), task('B', '2026-01-05', 2)], [link('A', 'B')])
    expect(dates(r, 'A')).toEqual(['2026-01-05', '2026-01-08'])
    expect(dates(r, 'B')).toEqual(['2026-01-08', '2026-01-10'])
  })

  it('skips the weekend when the predecessor ends on one', () => {
    const r = schedule([task('A', '2026-01-08', 2), task('B', '2026-01-08', 3)], [link('A', 'B')])
    expect(dates(r, 'B')).toEqual(['2026-01-12', '2026-01-15'])
  })

  it('applies positive and negative lags in working days', () => {
    const tasks = [task('A', '2026-01-05', 5), task('B', '2026-01-05', 1), task('C', '2026-01-05', 1)]
    const r = schedule(tasks, [link('A', 'B', '0', 1), link('A', 'C', '0', -1)])
    expect(r.tasks.get('B')!.start).toBe('2026-01-13') // Mon + 1 working day lag
    expect(r.tasks.get('C')!.start).toBe('2026-01-09') // one day of overlap
  })

  it('start-to-start offsets from the predecessor start', () => {
    const r = schedule([task('A', '2026-01-05', 5), task('B', '2026-01-05', 2)], [link('A', 'B', '1', 2)])
    expect(r.tasks.get('B')!.start).toBe('2026-01-07')
  })

  it('finish-to-finish aligns the ends', () => {
    const r = schedule([task('A', '2026-01-05', 3), task('B', '2026-01-05', 2)], [link('A', 'B', '2')])
    // A ends Thu 8th (exclusive); B (2d) ends the same day so starts Tue 6th.
    expect(dates(r, 'B')).toEqual(['2026-01-06', '2026-01-08'])
  })

  it('takes the latest of several predecessors', () => {
    const tasks = [task('A', '2026-01-05', 1), task('B', '2026-01-05', 4), task('C', '2026-01-05', 1)]
    const r = schedule(tasks, [link('A', 'C'), link('B', 'C')])
    expect(r.tasks.get('C')!.start).toBe('2026-01-09')
  })

  it('chains through several levels', () => {
    const tasks = [task('A', '2026-01-05', 1), task('B', '2026-01-05', 1), task('C', '2026-01-05', 1)]
    const r = schedule(tasks, [link('A', 'B'), link('B', 'C')])
    expect(r.tasks.get('C')!.start).toBe('2026-01-07')
  })

  it('works on a calendar where every day is a working day', () => {
    const r = schedule([task('A', '2026-01-08', 3), task('B', '2026-01-08', 1)], [link('A', 'B')], { calendar: allDays })
    expect(dates(r, 'A')).toEqual(['2026-01-08', '2026-01-11'])
    expect(r.tasks.get('B')!.start).toBe('2026-01-11')
  })
})

describe('schedule: milestones', () => {
  it('moves a milestone chained without lag to the next working day', () => {
    // A ends on Saturday the 10th.
    const r = schedule([task('A', '2026-01-08', 2), task('M', '2026-01-08', 0)], [link('A', 'M')])
    expect(dates(r, 'M')).toEqual(['2026-01-12', '2026-01-12'])
  })

  it('leaves a milestone where a positive lag puts it, even on a weekend', () => {
    // A ends Wed 21st; three working days of lag run Wed-Fri, ending on Saturday the 24th.
    const r = schedule([task('A', '2026-01-19', 2), task('M', '2026-01-19', 0)], [link('A', 'M', '0', 3)])
    expect(dates(r, 'M')).toEqual(['2026-01-24', '2026-01-24'])
  })
})

describe('schedule: strict vs non-strict', () => {
  const tasks = [task('A', '2026-01-05', 1), task('B', '2026-01-19', 1)]
  const links = [link('A', 'B')]

  it('strict pulls a task back to the earliest date its predecessors allow', () => {
    expect(schedule(tasks, links).tasks.get('B')!.start).toBe('2026-01-06')
  })

  it('non-strict leaves a task that is already late where it is', () => {
    expect(schedule(tasks, links, { strict: false }).tasks.get('B')!.start).toBe('2026-01-19')
  })

  it('keeps a task with no predecessors where it is, even on a weekend (like DHTMLX Pro)', () => {
    const r = schedule([task('X', '2026-01-10', 1)], [])
    expect(dates(r, 'X')).toEqual(['2026-01-10', '2026-01-13'])
  })

  it('can snap such a task to the next working day', () => {
    const r = schedule([task('X', '2026-01-10', 1)], [], { snapFixedStarts: true })
    expect(dates(r, 'X')).toEqual(['2026-01-12', '2026-01-13'])
  })
})

describe('schedule: summary tasks', () => {
  it('spans its children', () => {
    const tasks = [
      task('P', '2026-01-05', 0),
      task('A', '2026-01-05', 3, 'P'),
      task('B', '2026-01-05', 2, 'P')
    ]
    const r = schedule(tasks, [link('A', 'B')])
    const p = r.tasks.get('P')!
    expect(p.summary).toBe(true)
    expect([p.start, p.end]).toEqual(['2026-01-05', '2026-01-10'])
    expect(p.duration).toBe(5)
  })

  it('rolls up through several levels', () => {
    const tasks = [
      task('R', '2026-01-05', 0),
      task('P', '2026-01-05', 0, 'R'),
      task('A', '2026-01-05', 2, 'P'),
      task('Q', '2026-01-05', 1, 'R')
    ]
    const r = schedule(tasks, [link('A', 'Q')])
    expect(dates(r, 'P')).toEqual(['2026-01-05', '2026-01-07'])
    expect(dates(r, 'R')).toEqual(['2026-01-05', '2026-01-08'])
  })

  it('reports links that touch a summary task instead of dropping them silently', () => {
    const tasks = [task('P', '2026-01-05', 0), task('A', '2026-01-05', 1, 'P'), task('B', '2026-01-05', 1)]
    const r = schedule(tasks, [link('P', 'B')])
    expect(r.skippedLinks).toHaveLength(1)
  })
})

describe('schedule: problems', () => {
  it('reports a dependency cycle and schedules nothing in it', () => {
    const tasks = [task('A', '2026-01-05', 1), task('B', '2026-01-05', 1), task('C', '2026-01-05', 1)]
    const r = schedule(tasks, [link('A', 'B'), link('B', 'A')])
    expect(r.cycle?.sort()).toEqual(['A', 'B'])
    expect(r.tasks.has('A')).toBe(false)
    expect(r.tasks.has('C')).toBe(true)
  })

  it('ignores links to unknown tasks', () => {
    const r = schedule([task('A', '2026-01-05', 1)], [link('A', 'nope')])
    expect(r.skippedLinks).toHaveLength(1)
  })

  it('handles an empty project', () => {
    const r = schedule([], [])
    expect(r.projectEnd).toBeNull()
    expect(r.tasks.size).toBe(0)
  })
})

describe('schedule: float and critical path', () => {
  // A(3d) -> B(2d) -> C(1d), and X(1d) -> C. X can slip.
  const tasks = [
    task('A', '2026-01-05', 3),
    task('B', '2026-01-05', 2),
    task('C', '2026-01-05', 1),
    task('X', '2026-01-05', 1)
  ]
  const links = [link('A', 'B'), link('B', 'C'), link('X', 'C')]
  const r = schedule(tasks, links)

  it('marks the longest chain critical with zero float', () => {
    for (const id of ['A', 'B', 'C']) {
      expect(r.tasks.get(id)!.critical).toBe(true)
      expect(r.tasks.get(id)!.totalFloat).toBe(0)
    }
  })

  it('gives a parallel task the slack it has', () => {
    const x = r.tasks.get('X')!
    expect(x.critical).toBe(false)
    // X could start any working day from Mon 5th up to Fri 9th before it delays C (Mon 12th).
    expect(x.lateStart).toBe('2026-01-09')
    expect(x.totalFloat).toBe(4)
  })

  it('reports the project end', () => {
    expect(r.projectEnd).toBe('2026-01-13')
  })

  it('respects lags when computing float', () => {
    const lagged = schedule(
      [task('A', '2026-01-05', 1), task('B', '2026-01-05', 1), task('Z', '2026-01-05', 5)],
      [link('A', 'B', '0', 2)]
    )
    // Z (5d) ends Sat 10th and sets the project end; A -> 2d lag -> B ends Thu 8th.
    expect(lagged.tasks.get('Z')!.critical).toBe(true)
    expect(lagged.tasks.get('B')!.critical).toBe(false)
  })
})

// Expected dates are what DHTMLX Pro 8.0.6 (auto_scheduling, work_time) gives for the same project.
describe('constraints', () => {
  const june = (id: string, duration: number, constraint?: SchedTask['constraint'], start = '2026-06-01'): SchedTask => ({ id, start, duration, constraint })
  const after = (id: string): SchedLink => link('base', id)

  it('SNET waits for its date, never moves a task earlier, and keeps a weekend date', () => {
    const r = schedule(
      [june('base', 5), june('wait', 4, { type: 'snet', date: '2026-06-15' }), june('early', 3, { type: 'snet', date: '2026-06-02' }), june('sat', 3, { type: 'snet', date: '2026-06-13' })],
      [after('wait'), after('early'), after('sat')]
    )
    expect(dates(r, 'wait')).toEqual(['2026-06-15', '2026-06-19'])
    expect(dates(r, 'early')).toEqual(['2026-06-08', '2026-06-11'])
    expect(dates(r, 'sat')).toEqual(['2026-06-13', '2026-06-18'])
  })

  it('SNLT pulls a task back to its date, even past its predecessor, and flags the conflict', () => {
    const r = schedule([june('base', 5), june('late', 4, { type: 'snlt', date: '2026-06-03' }), june('ok', 3, { type: 'snlt', date: '2026-06-20' })], [after('late'), after('ok')])
    expect(r.tasks.get('late')!.start).toBe('2026-06-03')
    expect(r.conflicts.has('late')).toBe(true)
    expect(dates(r, 'ok')).toEqual(['2026-06-08', '2026-06-11'])
    expect(r.conflicts.has('ok')).toBe(false)
  })

  it('FNET, FNLT and MFO read their date as an end (the day after the last working day)', () => {
    const r = schedule(
      [june('fnet', 4, { type: 'fnet', date: '2026-06-24' }), june('fnlt', 5, { type: 'fnlt', date: '2026-06-26' }, '2026-06-22'), june('mfo', 3, { type: 'mfo', date: '2026-06-12' }, '2026-06-02')],
      []
    )
    expect(dates(r, 'fnet')).toEqual(['2026-06-18', '2026-06-24'])
    expect(dates(r, 'fnlt')).toEqual(['2026-06-19', '2026-06-26'])
    expect(dates(r, 'mfo')).toEqual(['2026-06-09', '2026-06-12'])
  })

  it('MSO moves a task to its date, earlier or later than its links allow', () => {
    const r = schedule([june('base', 5), june('earlier', 3, { type: 'mso', date: '2026-06-03' }), june('later', 3, { type: 'mso', date: '2026-06-17' })], [after('earlier'), after('later')])
    expect(r.tasks.get('earlier')!.start).toBe('2026-06-03')
    expect(r.tasks.get('later')!.start).toBe('2026-06-17')
  })

  it('ALAP slides a task towards its successor; with none it stays, pushed only by its predecessors', () => {
    const r = schedule(
      [june('a', 3), june('b', 2, { type: 'alap' }), june('long', 10), june('c', 4)],
      [link('a', 'b'), link('b', 'c'), link('long', 'c')]
    )
    // c waits for `long` (Mon 15th); b, which is free to slide, finishes just before it.
    expect(r.tasks.get('c')!.start).toBe('2026-06-15')
    expect(dates(r, 'b')).toEqual(['2026-06-11', '2026-06-13'])
    const alone = schedule([june('solo', 3, { type: 'alap' }, '2026-06-10')], [])
    expect(dates(alone, 'solo')).toEqual(['2026-06-10', '2026-06-13'])
  })

  it('ignores a constraint that needs a date and has none', () => {
    const r = schedule([june('x', 3, { type: 'snet' })], [])
    expect(dates(r, 'x')).toEqual(['2026-06-01', '2026-06-04'])
  })
})

// Expected dates are what DHTMLX Pro 8.0.6 (auto_scheduling, work_time) gives for the same project.
describe('constraints of parents, project start/end and scheduling from the end', () => {
  const t = (id: string, duration: number, extra: Partial<SchedTask> = {}, start = '2026-06-01'): SchedTask => ({ id, start, duration, ...extra })

  it('a child takes the constraint of its parent when it has none (or ASAP), and keeps its own otherwise', () => {
    const tasks = [
      t('fase', 0, { constraint: { type: 'snet', date: '2026-06-15' } }),
      t('a', 3, { parent: 'fase' }),
      t('b', 4, { parent: 'fase', constraint: { type: 'asap' } }),
      t('c', 2, { parent: 'fase', constraint: { type: 'snet', date: '2026-06-22' } }),
      t('free', 2)
    ]
    const without = schedule(tasks, [])
    expect(without.tasks.get('a')!.start).toBe('2026-06-01')
    const r = schedule(tasks, [], { inheritConstraints: true })
    expect(dates(r, 'a')).toEqual(['2026-06-15', '2026-06-18'])
    expect(dates(r, 'b')).toEqual(['2026-06-15', '2026-06-19'])
    expect(dates(r, 'c')).toEqual(['2026-06-22', '2026-06-24'])
    expect(dates(r, 'free')).toEqual(['2026-06-01', '2026-06-03'])
  })

  it('the project start moves up tasks with no predecessor, but not a Saturday start before a Monday', () => {
    const r = schedule(
      [t('before', 3), t('later', 3, {}, '2026-06-17'), t('sat', 2, {}, '2026-06-06'), t('after', 2), t('linked', 2)],
      [link('after', 'linked')],
      { projectStart: '2026-06-08' }
    )
    expect(dates(r, 'before')).toEqual(['2026-06-08', '2026-06-11'])
    expect(dates(r, 'later')).toEqual(['2026-06-17', '2026-06-20'])
    expect(dates(r, 'sat')).toEqual(['2026-06-06', '2026-06-10'])
    expect(r.tasks.get('linked')!.start).toBe('2026-06-10')
  })

  it('strict project start also pulls back the tasks that start after it', () => {
    const r = schedule([t('later', 3, {}, '2026-06-17')], [], { projectStart: '2026-06-08', strictProjectStart: true })
    expect(dates(r, 'later')).toEqual(['2026-06-08', '2026-06-11'])
  })

  it('scheduling from the end lines the chain up against the project end', () => {
    const r = schedule(
      [t('a', 4), t('b', 5), t('c', 3), t('d', 6), t('e', 2)],
      [link('a', 'b'), link('b', 'c'), link('d', 'c')],
      { scheduleFromEnd: true, projectEnd: '2026-07-10' }
    )
    expect(dates(r, 'a')).toEqual(['2026-06-24', '2026-06-30'])
    expect(dates(r, 'b')).toEqual(['2026-06-30', '2026-07-07'])
    expect(dates(r, 'c')).toEqual(['2026-07-07', '2026-07-10'])
    expect(dates(r, 'd')).toEqual(['2026-06-29', '2026-07-07'])
    expect(dates(r, 'e')).toEqual(['2026-07-08', '2026-07-10'])
  })

  it('from the end, a start-to-start link puts the predecessor at the successor start', () => {
    const r = schedule([t('a', 4), t('b', 5)], [link('a', 'b', '1')], { scheduleFromEnd: true, projectEnd: '2026-07-10' })
    expect(dates(r, 'a')).toEqual(['2026-07-03', '2026-07-09'])
    expect(dates(r, 'b')).toEqual(['2026-07-03', '2026-07-10'])
  })

  it('the project end pulls an ALAP task with no successor towards it, and leaves one already past it', () => {
    const r = schedule(
      [t('free', 3, { constraint: { type: 'alap' } }), t('past', 4, { constraint: { type: 'alap' } }, '2026-06-24'), t('asap', 3)],
      [],
      { projectEnd: '2026-06-26' }
    )
    expect(r.tasks.get('free')!.end).toBe('2026-06-26')
    expect(r.tasks.get('past')!.start).toBe('2026-06-24')
    expect(r.tasks.get('asap')!.start).toBe('2026-06-01')
  })
})

describe('pinned tasks', () => {
  it('a pinned task keeps a start later than its predecessors ask for; the others go back to the earliest', () => {
    const tasks: SchedTask[] = [
      { id: 'a', start: '2026-06-01', duration: 3 },
      { id: 'b', start: '2026-06-30', duration: 4 },
      { id: 'c', start: '2026-07-06', duration: 2 }
    ]
    const links = [link('a', 'b'), link('b', 'c')]
    const loose = schedule(tasks, links)
    expect(dates(loose, 'b')).toEqual(['2026-06-04', '2026-06-10'])
    const kept = schedule(tasks, links, { pinned: new Set(['b']) })
    expect(dates(kept, 'b')).toEqual(['2026-06-30', '2026-07-04'])
    expect(kept.tasks.get('c')!.start).toBe('2026-07-06')
  })
})
