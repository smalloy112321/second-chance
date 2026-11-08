import { useId } from 'react'

/** The "road to the horizon" mark: a road running to a sunrise, in a periwinkle tile with a
 * thick navy outline so it stands out against the light page. */
export function LogoMark({ size = 44, title }: { size?: number; title?: string }) {
  const clip = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="logo-mark"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="4" y="4" width="96" height="96" rx="21" />
        </clipPath>
      </defs>
      <rect x="4" y="4" width="96" height="96" rx="21" fill="#5865DC" />
      <g clipPath={`url(#${clip})`}>
        <path d="M38,42 a14,14 0 0,1 28,0 Z" fill="#F2E6E1" />
        <line x1="0" y1="42" x2="104" y2="42" stroke="#FFFFFF" strokeWidth="2.5" />
        <path d="M20,104 L84,104 L55,44 L49,44 Z" fill="#122056" />
        <path d="M52,102 L52,48" stroke="#FFFFFF" strokeWidth="2.5" strokeDasharray="8 6" />
      </g>
      <rect x="4" y="4" width="96" height="96" rx="21" fill="none" stroke="#122056" strokeWidth="8" />
    </svg>
  )
}

/** Horizontal lockup: mark + "The Second Chance" + "PATHWAY PLANNER". */
export default function Logo({ size = 44 }: { size?: number }) {
  return (
    <span className="logo" aria-label="The Second Chance Pathway Planner">
      <LogoMark size={size} />
      <span className="logo-words" aria-hidden="true">
        <span className="logo-name">The Second Chance</span>
        <span className="logo-sub">Pathway Planner</span>
      </span>
    </span>
  )
}
