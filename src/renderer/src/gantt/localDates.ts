const pad = (n: number): string => String(n).padStart(2, '0')

/** Local `YYYY-MM-DD` (the gantt library works with local dates). */
export const dateToIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const isoToDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
