import { useEffect, useRef } from 'react'

interface Props {
  title: string
  /** What will happen, in a sentence. */
  message: string
  confirmLabel?: string
  /** Styles the confirm button as destructive (red). */
  danger?: boolean
  /** Shows only the confirm button, for messages that need no decision. */
  hideCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** An in-app replacement for window.confirm: the native one freezes the renderer and ignores the theme. */
export default function ConfirmDialog({ title, message, confirmLabel = 'Aceptar', danger, hideCancel, onConfirm, onCancel }: Props): React.JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal modal-small" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message" className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          {!hideCancel && (
            <button type="button" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button ref={confirmRef} type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
