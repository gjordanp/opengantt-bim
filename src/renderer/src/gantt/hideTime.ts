import type { GanttStatic } from 'dhtmlx-gantt'

/**
 * Hide time units (weekends, non-working days) from the timeline, the way DHTMLX's PRO edition does it.
 *
 * The Community build already positions bars, links and markers around columns listed in the scale's `ignore_x`
 * map, but the step that fills that map is an empty stub. This fills it, from `gantt.ignore_time(date)`: the same
 * hook PRO uses, so `gantt.ignore_time = (d) => d.getDay() === 0` behaves as in PRO's "Not render weekends" sample.
 *
 * It reaches into an undocumented member (`$scaleHelper` of the timeline view); `installIgnoreTime` returns false
 * if the build has no such member, and the caller then leaves the timeline as it was.
 */
interface ScaleConfig {
  count: number
  display_count?: number
  trace_x: Date[]
  unit?: string
  step?: number
  max_date?: Date
  ignore_x?: Record<number, boolean>
  ignored_colls?: boolean
}
interface ScaleHelper {
  processIgnores: (config: ScaleConfig) => void
}

export function installIgnoreTime(gantt: GanttStatic): boolean {
  const view = (gantt as unknown as { $ui: { getView: (name: string) => { $scaleHelper?: ScaleHelper } | undefined } }).$ui.getView('timeline')
  const helper = view?.$scaleHelper
  if (!helper || typeof helper.processIgnores !== 'function') return false
  helper.processIgnores = function (config: ScaleConfig): void {
    const ignore = (gantt as unknown as { ignore_time?: (d: Date) => boolean }).ignore_time
    config.ignore_x = {}
    config.ignored_colls = false
    let shown = config.count
    if (ignore) {
      shown = 0
      const cols = config.trace_x
      const sub = config.unit === 'week' || config.unit === 'month' || config.unit === 'quarter' || config.unit === 'year'
      for (let i = 0; i < cols.length; i++) {
        const day = cols[i]
        let hide = ignore.call(gantt, day) as boolean
        // A week, month or year column holds many days: hide it only when every one of them is hidden (as PRO does),
        // not just because the day it starts on happens to be a weekend.
        if (hide && sub) {
          const end = i + 1 < cols.length ? cols[i + 1] : config.max_date
          hide = true
          if (end) for (let d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) if (!ignore.call(gantt, d)) { hide = false; break }
        }
        if (hide) {
          config.ignore_x[day.valueOf()] = true
          config.ignored_colls = true
        } else shown++
      }
    }
    config.display_count = shown
  }
  return true
}
