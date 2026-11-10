import { describe, expect, it } from 'vitest'
import { AI_PROMPT, parseAiPlan } from './aiPlan'

const plan = {
  name: 'Edificio X',
  tasks: [
    { id: 1, text: 'Obras preliminares', start_date: '2026-03-02', duration: 10, progress: 0, parent: null, type: 'project' },
    { id: 2, text: 'Faena', start_date: '2026-03-02', duration: 4, progress: 0.5, parent: 1, type: 'task' },
    { id: 3, text: 'Trazado', start_date: '2026-03-06', duration: 6, progress: 0, parent: 1, type: 'task' },
    { id: 4, text: 'Entrega', start_date: '2026-03-12', duration: 0, progress: 0, parent: 1, type: 'milestone' }
  ],
  links: [
    { source: 2, target: 3, type: 'FS', lag: 0 },
    { source: 3, target: 4, type: 'SS', lag: 2 }
  ]
}

describe('parseAiPlan', () => {
  it('reads the structure the prompt asks for', () => {
    const { data, warnings } = parseAiPlan(JSON.stringify(plan))
    expect(warnings).toEqual([])
    expect(data.name).toBe('Edificio X')
    expect(data.tasks.map((t) => [t.id, t.parent, t.type])).toEqual([
      ['1', '0', 'project'],
      ['2', '1', 'task'],
      ['3', '1', 'task'],
      ['4', '1', 'milestone']
    ])
    expect(data.links.map((l) => [l.source, l.target, l.type, l.lag])).toEqual([
      ['2', '3', '0', undefined],
      ['3', '4', '1', 2]
    ])
  })

  it('finds the JSON inside a ``` block with text around it', () => {
    const answer = `Claro, aquí está tu cronograma:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nAvísame si quieres cambios.`
    expect(parseAiPlan(answer).data.tasks).toHaveLength(4)
  })

  it('finds a bare JSON object between sentences', () => {
    expect(parseAiPlan(`Listo. ${JSON.stringify(plan)} Espero que sirva.`).data.tasks).toHaveLength(4)
  })

  it('accepts the original gantt format ({ data, links } with string link types)', () => {
    const old = { data: plan.tasks, links: [{ id: 1, source: 2, target: 3, type: '1' }] }
    const { data } = parseAiPlan(JSON.stringify(old))
    expect(data.name).toBe('Proyecto importado con IA')
    expect(data.links[0].type).toBe('1')
  })

  it('accepts Spanish link codes and percentages for progress', () => {
    const p = { tasks: [{ id: 1, text: 'A', start_date: '2026-01-05', duration: 2, progress: 50, parent: 0 }, { id: 2, text: 'B', start_date: '2026-01-07', duration: 2, progress: 0, parent: 0 }], links: [{ source: 1, target: 2, type: 'FC' }] }
    const { data } = parseAiPlan(JSON.stringify(p))
    expect(data.tasks[0].progress).toBe(0.5)
    expect(data.links[0].type).toBe('0')
  })

  it('fixes what it can and says what it did', () => {
    const messy = {
      tasks: [
        { id: 1, text: 'Padre', start_date: '2026-01-05', duration: 5, parent: null, type: 'task' },
        { id: 2, text: 'Hija', start_date: '2026-01-05', duration: 3, parent: 1 },
        { id: 3, text: 'Huérfana', start_date: '2026-13-45', duration: -2, parent: 99 },
        { id: 2, text: 'Repetida', start_date: '2026-01-05', duration: 1, parent: 1 },
        { text: '', start_date: '2026-01-05', duration: 1 }
      ],
      links: [
        { source: 2, target: 3, type: 'XX' },
        { source: 2, target: 99 },
        { source: 1, target: 3 }
      ]
    }
    const { data, warnings } = parseAiPlan(JSON.stringify(messy))
    expect(data.tasks.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(data.tasks[0].type).toBe('project') // it has a child
    expect(data.tasks[2].parent).toBe('0')
    expect(data.tasks[2].duration).toBe(1)
    expect(data.links).toHaveLength(1) // the missing target and the summary link are dropped
    expect(warnings.length).toBeGreaterThanOrEqual(6)
  })

  it('breaks parent loops', () => {
    const loop = { tasks: [{ id: 1, text: 'A', start_date: '2026-01-05', duration: 1, parent: 2 }, { id: 2, text: 'B', start_date: '2026-01-05', duration: 1, parent: 1 }] }
    const { data } = parseAiPlan(JSON.stringify(loop))
    const roots = data.tasks.filter((t) => t.parent === '0')
    expect(roots.length).toBeGreaterThan(0)
  })

  it('explains what is wrong when the answer cannot be used', () => {
    expect(() => parseAiPlan('')).toThrow(/Pega/)
    expect(() => parseAiPlan('hola, no tengo un cronograma')).toThrow(/JSON/)
    expect(() => parseAiPlan('{"name":"x"}')).toThrow(/tareas/)
    expect(() => parseAiPlan('{"tasks":[{"id":1}]}')).toThrow(/utilizable/)
  })

  it('has a prompt that shows the structure it reads', () => {
    expect(AI_PROMPT).toContain('"tasks"')
    expect(AI_PROMPT).toContain('"links"')
    expect(AI_PROMPT).toContain('FS')
  })
})
