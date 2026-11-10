/** A number written as text, with a decimal part or an exponent: "98.41795836116049", "-0.5", "1.2e-7". */
const DECIMAL = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

/**
 * Rounds a numeric value to 3 decimals for display ("98.41795836116049" → "98.418", "2824.9999999999995" → "2825").
 * Text that is not a decimal number (names, ids, whole numbers, dates) comes back as it is.
 */
export function roundValue(value: string): string {
  const v = value.trim()
  if (!DECIMAL.test(v) || !/[.eE]/.test(v)) return value
  const n = Number(v)
  if (!Number.isFinite(n)) return value
  const text = n.toFixed(3).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}
