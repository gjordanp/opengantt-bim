import { describe, expect, it } from 'vitest'
import { parseMspdi } from '../shared/mspdi'
import { mppToXml, resolveMppRuntime } from './mpp'

// Reads a real .mpp, so it needs the runtime (`npm run fetch:mpp`) and a file: set MPP_SAMPLE to its path.
const sample = process.env.MPP_SAMPLE
const ready = !!sample && !!resolveMppRuntime()

describe.skipIf(!ready)('reading a binary .mpp', () => {
  it('converts it to XML the importer understands', async () => {
    const { data, warnings } = parseMspdi(await mppToXml(sample!))
    console.log(JSON.stringify({ name: data.name, tasks: data.tasks.length, links: data.links.length, workWeek: data.workWeek, holidays: data.holidays?.length, warnings }, null, 1))
    expect(data.tasks.length).toBeGreaterThan(0)
  })

  it('rejects a file that is not a project', async () => {
    await expect(mppToXml(process.argv[1] ?? '')).rejects.toThrow()
  })
})
