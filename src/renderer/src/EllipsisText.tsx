import { useLayoutEffect, useRef, useState } from 'react'
import Tooltip from './Tooltip'

/** One line of text that is cut with "…" when it does not fit; the full text then shows in a tooltip on hover. */
export default function EllipsisText({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setCut(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  // The wrapper lets the text shrink inside a flex row; the tooltip only works while the text is cut.
  return (
    <span className="ellipsis-host">
      <Tooltip label={text} side="top" disabled={!cut}>
        <span ref={ref} className={`ellipsis${className ? ` ${className}` : ''}`}>
          {text}
        </span>
      </Tooltip>
    </span>
  )
}
