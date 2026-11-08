/** An S-curve: axes and the slow-fast-slow rise of cumulative progress. Same stroke style as the lucide icons. */
export default function SCurveIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M6.5 17.5c6 0 5-11 11.5-11" />
    </svg>
  )
}
