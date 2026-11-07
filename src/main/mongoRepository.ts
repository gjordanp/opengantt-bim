import { randomUUID } from 'node:crypto'
import { MongoClient, type Collection } from 'mongodb'
import type { ProjectData, ProjectLink, ProjectTask } from '../shared/model'
import { DB_NAME, type ProjectRepository, type ProjectSummary } from '../shared/repository'

/** Shape of a stored project. Tasks and links are embedded, so a save is atomic. */
interface ProjectDoc {
  _id: string
  name: string
  holidays?: string[]
  workWeek?: number[]
  bim?: ProjectData['bim']
  tasks: ProjectTask[]
  links: ProjectLink[]
  createdAt: Date
  updatedAt: Date
}

export class MongoProjectRepository implements ProjectRepository {
  private constructor(
    private readonly client: MongoClient,
    private readonly projects: Collection<ProjectDoc>
  ) {}

  /** Connects and verifies the server answers; rejects quickly if it doesn't. */
  static async connect(mongoUri: string, dbName: string = DB_NAME): Promise<MongoProjectRepository> {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 4000 })
    try {
      await client.connect()
      await client.db(dbName).command({ ping: 1 })
    } catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
    const projects = client.db(dbName).collection<ProjectDoc>('projects')
    await projects.createIndex({ updatedAt: -1 })
    return new MongoProjectRepository(client, projects)
  }

  async list(): Promise<ProjectSummary[]> {
    const docs = await this.projects
      .find({}, { projection: { name: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray()
    return docs.map((d) => ({ id: d._id, name: d.name, updatedAt: d.updatedAt.toISOString() }))
  }

  async load(id: string): Promise<ProjectData | null> {
    const doc = await this.projects.findOne({ _id: id })
    return doc
      ? { name: doc.name, holidays: doc.holidays ?? [], workWeek: doc.workWeek, bim: doc.bim, tasks: doc.tasks, links: doc.links }
      : null
  }

  async create(name: string, data?: Pick<ProjectData, 'tasks' | 'links'>): Promise<string> {
    const id = randomUUID()
    const now = new Date()
    await this.projects.insertOne({
      _id: id,
      name,
      tasks: data?.tasks ?? [],
      links: data?.links ?? [],
      createdAt: now,
      updatedAt: now
    })
    return id
  }

  async save(id: string, data: ProjectData): Promise<void> {
    const result = await this.projects.updateOne(
      { _id: id },
      {
        $set: {
          name: data.name,
          holidays: data.holidays ?? [],
          ...(data.workWeek ? { workWeek: data.workWeek } : {}),
          ...(data.bim ? { bim: data.bim } : {}),
          tasks: data.tasks,
          links: data.links,
          updatedAt: new Date()
        }
      }
    )
    if (result.matchedCount === 0) throw new Error(`Project ${id} not found`)
  }

  async remove(id: string): Promise<void> {
    await this.projects.deleteOne({ _id: id })
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
