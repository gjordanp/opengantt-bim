/** How the 3D view looks and responds, kept on this computer (not part of the project). */
export type CameraFeel = 'smooth' | 'normal' | 'agile'

export interface ViewerSettings {
  /** Draw the edges of every element (pen lines over the colors). */
  edges: boolean
  /** Outline the element under the cursor. */
  hover: boolean
  /** How quickly the camera follows the mouse when orbiting, panning and zooming. */
  camera: CameraFeel
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { edges: false, hover: true, camera: 'agile' }

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
      camera: raw.camera === 'smooth' || raw.camera === 'normal' ? raw.camera : 'agile'
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
