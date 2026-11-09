/** How the 3D view looks and responds, kept on this computer (not part of the project). */
export type CameraFeel = 'smooth' | 'normal' | 'agile'

export type Shadows = 'off' | 'soft' | 'strong'
export type EdgeWidth = 'thin' | 'normal' | 'thick'
export type AntiAliasing = 'off' | 'fast' | 'high'

export interface ViewerSettings {
  /** Draw the edges of every element (pen lines over the colors). */
  edges: boolean
  /** Outline the element under the cursor. */
  hover: boolean
  /** How quickly the camera follows the mouse when orbiting, panning and zooming. */
  camera: CameraFeel
  /** Ambient occlusion: soft contact shadows where surfaces meet. */
  shadows: Shadows
  /** Thickness of the edge lines. */
  edgeWidth: EdgeWidth
  /** Smoothing of jagged edges: SMAA (cheap) or multisampling (best, heavier). */
  antialiasing: AntiAliasing
  /** Lowers the resolution by itself when the frame rate drops (heavy models). */
  adaptive: boolean
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { edges: false, hover: true, camera: 'agile', shadows: 'soft', edgeWidth: 'normal', antialiasing: 'fast', adaptive: false }

/** Edge line width for each thickness (the library's own default is 1). */
export const EDGE_WIDTH: Record<EdgeWidth, number> = { thin: 0.6, normal: 1, thick: 2 }

/** Ambient-occlusion parameters for each strength, on top of the library's defaults. */
export const SHADOW_PARAMS: Record<Exclude<Shadows, 'off'>, { radius: number; scale: number }> = {
  soft: { radius: 0.2, scale: 1.1 },
  strong: { radius: 0.45, scale: 2.6 }
}

/** Camera-controls smoothing, in seconds, for each feel: `smooth` is the library's own gentle glide, `agile` is almost direct. */
export const CAMERA_FEEL: Record<CameraFeel, { smoothTime: number; draggingSmoothTime: number }> = {
  smooth: { smoothTime: 0.25, draggingSmoothTime: 0.125 },
  normal: { smoothTime: 0.1, draggingSmoothTime: 0.05 },
  agile: { smoothTime: 0.03, draggingSmoothTime: 0.008 }
}

const KEY = 'ogbim.viewerSettings'

export function loadViewerSettings(): ViewerSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ViewerSettings> | null
    if (!raw) return DEFAULT_VIEWER_SETTINGS
    return {
      edges: raw.edges === true,
      hover: raw.hover !== false,
      camera: raw.camera === 'smooth' || raw.camera === 'normal' ? raw.camera : 'agile',
      shadows: raw.shadows === 'off' || raw.shadows === 'strong' ? raw.shadows : 'soft',
      edgeWidth: raw.edgeWidth === 'thin' || raw.edgeWidth === 'thick' ? raw.edgeWidth : 'normal',
      antialiasing: raw.antialiasing === 'off' || raw.antialiasing === 'high' ? raw.antialiasing : 'fast',
      adaptive: raw.adaptive === true
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
