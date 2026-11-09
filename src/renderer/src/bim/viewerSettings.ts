/** How the 3D view looks, kept on this computer (not part of the project). Every option is on or off. */
export interface ViewerSettings {
  /** Draw the edges of every element (pen lines over the colors). */
  edges: boolean
  /** Outline the element under the cursor. */
  hover: boolean
  /** Ambient occlusion: soft contact shadows where surfaces meet. */
  shadows: boolean
  /** Smoothing of jagged edges (SMAA). */
  antialiasing: boolean
  /** Lowers the resolution by itself when the frame rate drops (heavy models). */
  adaptive: boolean
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { edges: true, hover: true, shadows: true, antialiasing: true, adaptive: false }

/** Ambient-occlusion parameters, on top of the library's defaults. */
export const SHADOW_PARAMS = { radius: 0.2, scale: 1.1 }

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
      shadows: flag(raw.shadows, d.shadows),
      antialiasing: flag(raw.antialiasing, d.antialiasing),
      adaptive: flag(raw.adaptive, d.adaptive)
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
