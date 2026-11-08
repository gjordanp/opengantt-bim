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
  await addVolumes(model, elements)
  return elements
}

/**
 * Volume of each element, from its geometry: That Open's `getItemsVolume` sums the signed volumes of the
 * tetrahedra a mesh's triangles make with the origin (divergence theorem), so it needs closed meshes. It
 * takes a list and returns the total, so it is called once per element, a slice at a time.
 */
async function addVolumes(model: FRAGS.FragmentsModel, elements: BimElement[]): Promise<void> {
  const SLICE = 100
  for (let i = 0; i < elements.length; i += SLICE) {
    const slice = elements.slice(i, i + SLICE)
    const volumes = await Promise.all(slice.map((el) => model.getItemsVolume([el.localId]).catch(() => 0)))
    slice.forEach((el, k) => {
      if (volumes[k] > 0) el.volume = volumes[k]
    })
  }
}
