export interface RowMenuItem {
  label: string
  /** Shortcut shown on the right, e.g. "Insert". */
  hint?: string
  danger?: boolean
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
    b.className = `menu-item row-menu-item${item.danger ? ' danger' : ''}`
    b.setAttribute('role', 'menuitem')
    b.disabled = !!item.disabled
    const label = document.createElement('span')
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
