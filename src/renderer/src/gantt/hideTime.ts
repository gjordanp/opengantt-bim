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
      for (const day of config.trace_x) {
        if (ignore.call(gantt, day)) {
          config.ignore_x[day.valueOf()] = true
          config.ignored_colls = true
        } else shown++
      }
    }
    config.display_count = shown
  }
  return true
}
