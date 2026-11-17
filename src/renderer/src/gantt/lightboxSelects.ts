import type { GanttStatic } from 'dhtmlx-gantt'

/** The type selector lists the kinds of task in this order. */
const TYPE_ORDER = ['project', 'task', 'milestone']

const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

/**
 * Gives the selects of the edit window the app's own look when they open: the native list is replaced by the same
 * floating list the dropdowns use (`dd-list`). The real `<select>` stays the source of truth (its value is set and its
 * `change` event fired), so the gantt's own code keeps reading and reacting to it.
 * Also puts the options of the type selector in the order Proyecto, Tarea, Hito.
 */
export function installLightboxSelects(gantt: GanttStatic): () => void {
  let pop: HTMLDivElement | null = null
  let owner: HTMLSelectElement | null = null
  let active = 0

  const close = (): void => {
    pop?.remove()
    pop = null
    owner = null
  }

  const choose = (select: HTMLSelectElement, index: number): void => {
    select.selectedIndex = index
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    close()
    select.focus()
  }

  const highlight = (): void => {
    if (!pop) return
    pop.querySelectorAll<HTMLElement>('.dd-item').forEach((item, i) => {
      item.classList.toggle('active', i === active)
      if (i === active) item.scrollIntoView({ block: 'nearest' })
    })
  }

  const open = (select: HTMLSelectElement): void => {
    close()
    owner = select
    active = Math.max(0, select.selectedIndex)
    const rect = select.getBoundingClientRect()
    pop = document.createElement('div')
    pop.className = 'dd-list'
    pop.setAttribute('role', 'listbox')
    ;[...select.options].forEach((option, i) => {
      const item = document.createElement('div')
      item.className = 'dd-item'
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(i === select.selectedIndex))
      const check = document.createElement('span')
      check.className = 'dd-check'
      if (i === select.selectedIndex) check.innerHTML = CHECK
      const label = document.createElement('span')
      label.className = 'dd-label'
      label.textContent = option.text
      item.append(check, label)
      item.addEventListener('mousemove', () => {
        active = i
        highlight()
      })
      // mousedown, like the dropdowns: the choice is made before anything can take the focus away.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        choose(select, i)
      })
      pop!.appendChild(item)
    })
    pop.style.minWidth = `${Math.max(rect.width, 120)}px`
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 120) - 8))}px`
    document.body.appendChild(pop)
    // Under the select, or above it when there is no room below.
    const height = pop.offsetHeight
    pop.style.top = `${rect.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, rect.top - 4 - height) : rect.bottom + 4}px`
    highlight()
  }

  const inLightbox = (el: EventTarget | null): el is HTMLSelectElement => el instanceof HTMLSelectElement && !!el.closest('.gantt_cal_light') && !el.disabled

  const onMouseDown = (e: MouseEvent): void => {
    if (inLightbox(e.target)) {
      e.preventDefault() // no native list
      e.target.focus()
      if (owner === e.target) close()
      else open(e.target)
    } else if (pop && !(e.target as HTMLElement | null)?.closest?.('.dd-list')) close()
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    if (pop && owner) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = owner.options.length
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
        highlight()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        choose(owner, active)
      } else if (e.key === 'Tab') close()
      return
    }
    if (inLightbox(e.target) && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      open(e.target)
    }
  }
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('keydown', onKeyDown, true)

  // The kinds of task, as Proyecto, Tarea, Hito (the library lists them as task, project, milestone).
  const lightboxEvent = gantt.attachEvent('onLightbox', () => {
    window.setTimeout(() => {
      for (const select of document.querySelectorAll<HTMLSelectElement>('.gantt_cal_light select')) {
        const values = [...select.options].map((o) => o.value)
        if (!TYPE_ORDER.every((v) => values.includes(v)) || values.length !== TYPE_ORDER.length) continue
        const current = select.value
        for (const v of TYPE_ORDER) select.appendChild([...select.options].find((o) => o.value === v)!)
        select.value = current
      }
    }, 0)
    return true
  })
  const closeEvent = gantt.attachEvent('onAfterLightbox', () => {
    close()
    return true
  })

  return () => {
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    gantt.detachEvent(lightboxEvent)
    gantt.detachEvent(closeEvent)
    close()
  }
}
