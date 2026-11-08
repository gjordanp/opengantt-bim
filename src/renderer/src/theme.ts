import { useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'ogbim.theme'
const listeners = new Set<() => void>()
const dark = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable: follow the system */
  }
  return 'system'
}

export const resolveTheme = (pref: ThemePref): ResolvedTheme => (pref === 'system' ? (dark().matches ? 'dark' : 'light') : pref)

/** Puts the theme on <html> (the CSS reads `data-theme`) and tells the main process so the window chrome follows. */
export function applyTheme(pref: ThemePref = getThemePref()): ResolvedTheme {
  const theme = resolveTheme(pref)
  document.documentElement.dataset.theme = theme
  void window.api?.appearance?.setTheme(theme)
  return theme
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* the choice just won't be remembered */
  }
  applyTheme(pref)
  listeners.forEach((l) => l())
}

// "System" follows the OS while the app is open.
if (typeof window !== 'undefined') {
  dark().addEventListener('change', () => {
    if (getThemePref() === 'system') {
      applyTheme('system')
      listeners.forEach((l) => l())
    }
  })
}

export function useTheme(): { pref: ThemePref; theme: ResolvedTheme } {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = (): void => tick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const pref = getThemePref()
  return { pref, theme: resolveTheme(pref) }
}

export const nextThemePref = (pref: ThemePref): ThemePref => (pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system')
