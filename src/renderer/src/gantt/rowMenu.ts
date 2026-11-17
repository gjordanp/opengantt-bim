export interface RowMenuItem {
  label: string
  /** Shortcut shown on the right, e.g. "Insert". */
  hint?: string
  danger?: boolean
  /** Inner markup of a 24x24 stroke icon (lucide style). */
  icon?: string
  disabled?: boolean
  run: () => void
}

/** A small right-click menu at the pointer: items (or `null` for a separator), closed by a click away, Escape or choosing one. */
export function showRowMenu(e: MouseEvent, items: (RowMenuItem | null)[]): void {
  document.getElementById('gantt-row-menu')?.remove()
  const pop = document.createElement('div')
  pop.id = 'gantt-row-menu'
  pop.className = 'menu-pop row-menu'
  pop.setAttribute('role', 'menu')
  pop.style.position = 'fixed'
  pop.style.right = 'auto'

  const close = (): void => {
    pop.remove()
    window.removeEventListener('mousedown', away, true)
    window.removeEventListener('keydown', esc, true)
    window.removeEventListener('blur', close)
  }
  const away = (ev: MouseEvent): void => {
    if (!pop.contains(ev.target as Node)) close()
  }
  const esc = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close()
  }

  for (const item of items) {
    if (!item) {
      const sep = document.createElement('div')
      sep.className = 'menu-sep'
      pop.appendChild(sep)
      continue
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `menu-item row-menu-item${item.danger ? ' row-menu-danger' : ''}`
    b.setAttribute('role', 'menuitem')
    b.disabled = !!item.disabled
    if (item.icon) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      icon.setAttribute('viewBox', '0 0 24 24')
      icon.setAttribute('width', '15')
      icon.setAttribute('height', '15')
      icon.setAttribute('fill', 'none')
      icon.setAttribute('stroke', 'currentColor')
      icon.setAttribute('stroke-width', '2')
      icon.setAttribute('stroke-linecap', 'round')
      icon.setAttribute('stroke-linejoin', 'round')
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML = item.icon
      b.appendChild(icon)
    }
    const label = document.createElement('span')
    label.className = 'row-menu-label'
    label.textContent = item.label
    b.appendChild(label)
    if (item.hint) {
      const hint = document.createElement('kbd')
      hint.textContent = item.hint
      b.appendChild(hint)
    }
    b.onclick = (): void => {
      close()
      item.run()
    }
    pop.appendChild(b)
  }

  document.body.appendChild(pop)
  const r = pop.getBoundingClientRect()
  pop.style.left = `${Math.max(4, Math.min(e.clientX, window.innerWidth - r.width - 4))}px`
  pop.style.top = `${Math.max(4, Math.min(e.clientY, window.innerHeight - r.height - 4))}px`
  window.addEventListener('mousedown', away, true)
  window.addEventListener('keydown', esc, true)
  window.addEventListener('blur', close)
}
