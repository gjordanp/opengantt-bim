import { useEffect, useMemo, useState } from 'react'
import { Bot, Check, Copy } from 'lucide-react'
import { AI_PROMPT, parseAiPlan, type AiPlanImport } from '@shared/aiPlan'

interface Props {
  /** Called with the parsed plan when the user confirms. */
  onImport: (plan: AiPlanImport) => void
  onCancel: () => void
}

/** Two steps: copy the prompt into any AI chat, then paste its JSON answer back. */
export default function AiImportDialog({ onImport, onCancel }: Props): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // The answer is read as it is pasted, so the problem shows before importing.
  const result = useMemo<{ plan: AiPlanImport } | { error: string } | null>(() => {
    if (!answer.trim()) return null
    try {
      return { plan: parseAiPlan(answer) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [answer])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The prompt is also visible below to copy by hand.
    }
  }

  const plan = result && 'plan' in result ? result.plan : null

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal ai-import" role="dialog" aria-labelledby="ai-import-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="ai-import-title">
          <Bot size={18} /> Importar con IA
        </h2>
        <p className="muted">Describe tu proyecto a un asistente de IA (ChatGPT, Claude, Gemini…) y pega aquí su respuesta para crear el cronograma.</p>

        <div className="ai-step">
          <div className="ai-step-head">
            <span className="ai-num">1</span>
            <b>Copia las instrucciones</b>
            <button type="button" onClick={() => void copy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="muted">Pégalas en el chat de la IA y escribe después la descripción de tu proyecto (fases, duraciones, fecha de inicio).</p>
          <textarea className="ai-prompt" readOnly value={AI_PROMPT} rows={5} aria-label="Instrucciones para la IA" onFocus={(e) => e.currentTarget.select()} />
        </div>

        <div className="ai-step">
          <div className="ai-step-head">
            <span className="ai-num">2</span>
            <b>Pega la respuesta de la IA</b>
          </div>
          <textarea className="ai-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} placeholder='{ "name": "…", "tasks": [ … ], "links": [ … ] }' aria-label="Respuesta de la IA" />
          {result && 'error' in result && <p className="ai-status bad">{result.error}</p>}
          {plan && (
            <div className="ai-status ok">
              <b>
                Se leyeron {plan.data.tasks.length} tareas y {plan.data.links.length} vínculos.
              </b>
              {plan.warnings.length > 0 && (
                <ul>
                  {plan.warnings.slice(0, 6).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {plan.warnings.length > 6 && <li>…y {plan.warnings.length - 6} avisos más.</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={!plan} onClick={() => plan && onImport(plan)}>
            Crear proyecto
          </button>
        </div>
      </div>
    </div>
  )
}
