import type * as FRAGS from '@thatopen/fragments'
import type { BimElement } from '@shared/bimQuery'

type Node = { category: string | null; localId: number | null; children?: Node[] }

const CHUNK = 500

const str = (v: unknown): string => (v && typeof v === 'object' && 'value' in v ? String((v as { value: unknown }).value ?? '') : '')

/**
 * Reads every element with geometry from a loaded model: class, name, GlobalId
 * and the building storey it belongs to. This is what searches and groups run on.
 *
 * The spatial tree alternates "category" nodes (category set, no id) with "item"
 * nodes (id set, no category); a storey is an item under an IFCBUILDINGSTOREY node.
 */
export async function indexModel(model: FRAGS.FragmentsModel): Promise<BimElement[]> {
  const modelId = model.modelId
  const storeyOf = new Map<number, number>()
  const storeyIds: number[] = []

  const collect = (node: Node, storeyId: number): void => {
    if (node.localId !== null) storeyOf.set(node.localId, storeyId)
    for (const child of node.children ?? []) collect(child, storeyId)
  }
  const walk = (node: Node): void => {
    if (node.category === 'IFCBUILDINGSTOREY') {
      for (const item of node.children ?? []) {
        if (item.localId === null) continue
        storeyIds.push(item.localId)
        collect(item, item.localId)
      }
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk((await model.getSpatialStructure()) as Node)

  const storeyNames = new Map<number, string>()
  if (storeyIds.length > 0) {
    const data = await model.getItemsData(storeyIds, { attributesDefault: false, attributes: ['Name'] })
    data.forEach((d, i) => storeyNames.set(storeyIds[i], str((d as Record<string, unknown>).Name)))
  }

  const ids = await model.getItemsIdsWithGeometry()
  const elements: BimElement[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const data = await model.getItemsData(slice, { attributesDefault: false, attributes: ['Name'] })
    data.forEach((d) => {
      const rec = d as Record<string, unknown>
      const localId = Number(str(rec._localId))
      const storeyId = storeyOf.get(localId)
      elements.push({
        modelId,
        localId,
        guid: str(rec._guid),
        category: str(rec._category),
        name: str(rec.Name),
        storey: storeyId === undefined ? '' : (storeyNames.get(storeyId) ?? '')
      })
    })
  }
  return elements
}
