import type * as FRAGS from '@thatopen/fragments'
import type { BimElement } from '@shared/bimQuery'

type Node = { category: string | null; localId: number | null; children?: Node[] }

const CHUNK = 200

const PROP_VALUE_KEYS = ['NominalValue', 'LengthValue', 'AreaValue', 'VolumeValue', 'WeightValue', 'CountValue', 'TimeValue', 'Value']
const ATTRIBUTES = ['Description', 'ObjectType', 'Tag', 'PredefinedType']
const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []) as Record<string, unknown>[]

/** Adds the properties of one property set (or quantity set) as `Set.Property`; values already there win. */
function addSet(set: Record<string, unknown>, out: Record<string, string>): void {
  const setName = str(set.Name)
  if (!setName) return
  for (const p of [...asArray(set.HasProperties), ...asArray(set.Quantities)]) {
    const name = str(p.Name)
    if (!name) continue
    let value = ''
    for (const k of PROP_VALUE_KEYS) {
      const v = str(p[k])
      if (v !== '') {
        value = v
        break
      }
    }
    const key = `${setName}.${name}`
    if (value !== '' && !(key in out)) out[key] = value
  }
}

/** Attributes and property sets of an element (and of its type), from `getItemsData` with its relations. */
function readProps(rec: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of ATTRIBUTES) {
    const v = str(rec[a])
    if (v !== '') out[`Atributos.${a}`] = v
  }
  for (const set of asArray(rec.IsDefinedBy)) addSet(set, out)
  for (const type of asArray(rec.IsTypedBy)) for (const set of asArray(type.HasPropertySets)) addSet(set, out)
  return out
}

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
    const data = await readSlice(model, slice)
    data.forEach((d) => {
      const rec = d as Record<string, unknown>
      const props = readProps(rec)
      const localId = Number(str(rec._localId))
      const storeyId = storeyOf.get(localId)
      elements.push({
        modelId,
        localId,
        guid: str(rec._guid),
        category: str(rec._category),
        name: str(rec.Name),
        storey: storeyId === undefined ? '' : (storeyNames.get(storeyId) ?? ''),
        ...(Object.keys(props).length > 0 ? { props } : {})
      })
    })
  }
  await addVolumes(model, elements)
  return elements
}

/** Name, attributes and property sets of a slice of elements; without the relations if the model won't give them. */
async function readSlice(model: FRAGS.FragmentsModel, slice: number[]): Promise<unknown[]> {
  try {
    return await model.getItemsData(slice, {
      attributesDefault: true,
      relations: { IsDefinedBy: { attributes: true, relations: true }, IsTypedBy: { attributes: true, relations: true } }
    })
  } catch {
    return model.getItemsData(slice, { attributesDefault: false, attributes: ['Name'] })
  }
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
