/** How the 3D view looks, kept on this computer (not part of the project). Every option is on or off. */
export interface ViewerSettings {
  /** Draw the edges of every element (pen lines over the colors). */
  edges: boolean
  /** Outline the element under the cursor. */
  hover: boolean
  /** Smoothing of jagged edges (SMAA). */
  antialiasing: boolean
  /** Lowers the resolution by itself when the frame rate drops (heavy models). */
  adaptive: boolean
  /** Color of the edge lines, as #rrggbb. */
  edgeColor: string
  /** Paint every element in the model's own colors (on) or in one uniform color (off). */
  modelColors: boolean
  /** The uniform color used when `modelColors` is off, as #rrggbb. */
  elementColor: string
}

/** Colors offered for the edges and for the uniform element color. */
export const EDGE_COLORS = ['#000000', '#7a7a7a', '#475569', '#8b5cf6', '#0ea5e9', '#ef4444', '#ffffff']
export const ELEMENT_COLORS = ['#e5e7eb', '#cbd5e1', '#fde68a', '#bbf7d0', '#bae6fd', '#fecaca']

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { edges: true, hover: true, antialiasing: true, adaptive: false, edgeColor: '#7a7a7a', modelColors: true, elementColor: '#e5e7eb' }


/** Camera-controls smoothing, in seconds: almost direct, so orbiting follows the mouse without lag. */
export const CAMERA_FEEL = { smoothTime: 0.03, draggingSmoothTime: 0.008 }

const KEY = 'ogbim.viewerSettings'

/** Reads a stored flag; older versions stored 'off' / 'soft' / 'strong' / 'fast' / 'high' strings here. */
function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'off') return false
  if (value === 'soft' || value === 'strong' || value === 'fast' || value === 'high') return true
  return fallback
}

export function loadViewerSettings(): ViewerSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null
    if (!raw) return DEFAULT_VIEWER_SETTINGS
    const d = DEFAULT_VIEWER_SETTINGS
    return {
      edges: flag(raw.edges, d.edges),
      hover: flag(raw.hover, d.hover),
      antialiasing: flag(raw.antialiasing, d.antialiasing),
      adaptive: flag(raw.adaptive, d.adaptive),
      edgeColor: isHex(raw.edgeColor) ? raw.edgeColor : d.edgeColor,
      modelColors: flag(raw.modelColors, d.modelColors),
      elementColor: isHex(raw.elementColor) ? raw.elementColor : d.elementColor
    }
  } catch {
    return DEFAULT_VIEWER_SETTINGS
  }
}

export function saveViewerSettings(settings: ViewerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private window or blocked storage: the settings just last for this session.
  }
}
