/// <reference types="vite/client" />
import type { AppApi } from '@shared/api'

declare global {
  interface Window {
    /** Absent when the renderer runs alone in a plain browser (`npm run dev:web`). */
    api?: AppApi
  }
}
