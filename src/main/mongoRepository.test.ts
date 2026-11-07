import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startLocalMongo, resolveMongodPath, type LocalMongo } from './localMongo'
import { MongoProjectRepository } from './mongoRepository'
import type { ProjectData } from '../shared/model'

// These run the real bundled mongod, so they need `npm run fetch:mongod` first.
const binaryPath = resolveMongodPath()

const sample: ProjectData = {
  name: 'Demo',
  tasks: [
    { id: '1', text: 'A', start_date: '2026-01-05', duration: 3, progress: 0, parent: '0' },
    { id: '2', text: 'B', start_date: '2026-01-08', duration: 2, progress: 0.5, parent: '0', location_surface: 40 }
  ],
  links: [{ id: 'l1', source: '1', target: '2', type: '0', lag: 1 }]
}

describe.skipIf(!binaryPath)('local mongod + MongoProjectRepository', () => {
  let dataDir: string
  let mongo: LocalMongo
  let repo: MongoProjectRepository

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ogbim-mongo-'))
    mongo = await startLocalMongo({ binaryPath: binaryPath!, dataDir })
    repo = await MongoProjectRepository.connect(mongo.uri, 'test')
  }, 60_000)

  afterAll(async () => {
    await repo?.close()
    await mongo?.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }, 30_000)

  it('listens only on localhost, on a port of its own', () => {
    expect(mongo.uri).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+$/)
  })

  it('creates, loads and lists a project', async () => {
    const id = await repo.create('Demo', sample)
    expect(await repo.load(id)).toEqual(sample)
    expect((await repo.list()).map((p) => p.id)).toContain(id)
  })

  it('saves changes to tasks, links and name', async () => {
    const id = await repo.create('Old name')
    await repo.save(id, sample)
    const loaded = await repo.load(id)
    expect(loaded?.name).toBe('Demo')
    expect(loaded?.tasks).toHaveLength(2)
    expect(loaded?.links[0].lag).toBe(1)
  })

  it('lists the most recently saved project first', async () => {
    const first = await repo.create('first')
    await repo.create('second')
    await repo.save(first, { name: 'first', tasks: [], links: [] })
    expect((await repo.list())[0].id).toBe(first)
  })

  it('returns null for an unknown id and rejects saving to it', async () => {
    expect(await repo.load('nope')).toBeNull()
    await expect(repo.save('nope', sample)).rejects.toThrow()
  })

  it('removes a project', async () => {
    const id = await repo.create('temp')
    await repo.remove(id)
    expect(await repo.load(id)).toBeNull()
  })

  it('keeps data across a restart of the same data folder', async () => {
    const id = await repo.create('persisted', sample)
    await repo.close()
    await mongo.stop()

    mongo = await startLocalMongo({ binaryPath: binaryPath!, dataDir })
    repo = await MongoProjectRepository.connect(mongo.uri, 'test')
    expect((await repo.load(id))?.name).toBe('persisted')
  }, 60_000)
})

describe('MongoProjectRepository without a server', () => {
  it('fails fast when nothing is listening', async () => {
    await expect(MongoProjectRepository.connect('mongodb://127.0.0.1:1')).rejects.toThrow()
  }, 15_000)
})
