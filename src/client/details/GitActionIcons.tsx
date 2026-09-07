import type { ReactNode } from 'react'

/** Plus glyph for stage (and matching header bulk stage). */
export function IconGitPlus({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Minus glyph for unstage (and matching header bulk unstage). */
export function IconGitMinus({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Counter-clockwise undo glyph for discard. */
export function IconGitUndo({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 6.5H2.5V4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.2 6.2A5.5 5.5 0 1 1 4 12.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Magic-wand glyph for commit-message generation. */
export function IconGitWand({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.8 13.2 10.2 5.8l1.2 1.2-7.4 7.4-2 .4.8-1.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M11.2 3.1 12.1 2M12.8 4.6 14 4.1M10.2 4.4 9.7 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
